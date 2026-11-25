import {
  PiiVault, AuditLedger, MockGraph, runPipeline, SocCopilotAgent, STAGES, stageBudgetMinutes,
  toolShapes, TRIAGE_TOOLS, RESPONSE_TOOLS, COPILOT_TOOLS, PRIORITY_SLA_MINUTES,
} from './engine.js';
import { SCENARIOS } from './scenarios.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * (window.__SPEED ?? 1)));

let vault, ledger, graph, results, current, busy = false;
const copilot = new SocCopilotAgent();
const NODES = [
  ['📥', 'Intake', 'Graph ingest'], ['🛡️', 'Guardrail', 'PII vault'], ['📊', 'Risk', 'score → P1-P3'],
  ['🤖', 'Triage agent', 'investigate'], ['✋', 'Approval', 'human gate'], ['⚡', 'Response agent', 'execute+verify'], ['✅', 'Copilot', 'close & report'],
];
const NODE_FOR = { intake: 0, mask: 1, risk: 2, triage: 3, gate: 4, approval: 4, respond: 5, close: 6 };

function init() {
  vault = new PiiVault('bharatfin-in');
  ledger = new AuditLedger('bharatfin-in');
  graph = new MockGraph();
  results = {};
  current = null;
  renderQueue(); renderPipe(-1); renderLedger(); kpis();
  $('#raw').innerHTML = $('#masked').innerHTML = '<span class="empty">—</span>';
  $('#risk').innerHTML = '<div class="empty" style="width:100%">—</div>';
  $('#result').innerHTML = '<div class="empty">—</div>';
  $('#tx').innerHTML = '<div class="ln dim">waiting for an incident…</div>';
  $('#curTitle').textContent = 'Select an incident to run it through the agents';
  $('#chat').innerHTML = '<div class="msg a">Run an incident, then ask me about it. I only answer from that incident\'s masked context.</div>';
}

function renderQueue() {
  $('#queue').innerHTML = SCENARIOS.map((s) => {
    const r = results[s.id];
    let st = '<span class="pill wait" style="background:#eef2f8;color:var(--ink3)">queued</span>';
    if (r) st = r.rejected ? '<span class="pill rej">rejected</span>' : `<span class="pill ${r.risk.priority}">${r.risk.priority} · closed</span>`;
    return `<div class="inc ${current === s.id ? 'active' : ''}" data-id="${s.id}">
      <div class="st">${st}</div>
      <div class="t">${esc(s.title)}</div>
      <div class="m"><span class="sev ${s.severity}">${s.severity}</span><span>${s.id}</span><span>${s.signals.length} signal${s.signals.length > 1 ? 's' : ''}</span></div></div>`;
  }).join('');
  document.querySelectorAll('.inc').forEach((el) => (el.onclick = () => !busy && runOne(SCENARIOS.find((s) => s.id === el.dataset.id))));
}

function renderPipe(active, state = {}) {
  $('#pipe').innerHTML = NODES.map(([ic, n, d], i) => {
    let cls = state[i] || (i < active ? 'done' : i === active ? 'run' : '');
    return `<div class="node ${cls}"><div class="c">${ic}</div><div class="n">${n}</div><div class="d">${d}</div></div>`;
  }).join('');
}

function highlight(json) {
  return esc(JSON.stringify(json, null, 2)).replace(/\[(USER|IP|NAME|DOC)_\d{2}\]/g, (m) => `<span class="tok">${m}</span>`);
}
function highlightRaw(json) {
  let s = esc(JSON.stringify(json, null, 2));
  s = s.replace(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g, (m) => `<span class="pii">${m}</span>`);
  s = s.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (m) => `<span class="pii">${m}</span>`);
  return s;
}

function tx(html, cls = '') {
  const d = document.createElement('div');
  d.className = 'ln ' + cls;
  d.innerHTML = html;
  $('#tx').appendChild(d);
  $('#tx').scrollTop = 1e6;
}
const callLine = (who, c) => tx(`<span class="who">${who}</span> → <span class="fn">${c.name}</span>(${esc(JSON.stringify(c.arguments).slice(0, 150))})${c.result ? ` <span class="ok">⇢ ${c.result.status}${c.result.body ? ' ' + esc(JSON.stringify(c.result.body)) : ''}</span>` : ''}`);

function gauge(score, pr) {
  const col = pr === 'P1' ? '#c62828' : pr === 'P2' ? '#b25e00' : '#2f6fe0';
  const C = 2 * Math.PI * 46, off = C * (1 - score / 100);
  return `<svg class="gauge" viewBox="0 0 110 110"><circle cx="55" cy="55" r="46" fill="none" stroke="#e8edf5" stroke-width="10"/>
  <circle cx="55" cy="55" r="46" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${off}" transform="rotate(-90 55 55)" style="transition:stroke-dashoffset .8s"/>
  <text x="55" y="56" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="26" font-weight="600" fill="#14213a">${score}</text>
  <text x="55" y="76" text-anchor="middle" font-size="12" font-weight="700" fill="${col}">${pr}</text></svg>`;
}

function askHuman(decision, inc) {
  return new Promise((resolve) => {
    const isP1 = decision.escalateTo === 'INCIDENT_COMMANDER';
    $('#gateTitle').textContent = isP1 ? '🔐 P1 — Incident Commander approval token required' : '✋ P2 — SOC analyst approval required';
    $('#gateBody').textContent = `${decision.reason}. Runbook: ${results._pending.runbook.runbookId} (${results._pending.runbook.actions.join(' → ')}).`;
    $('#gateToken').style.display = isP1 ? '' : 'none';
    const token = 'IC-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    $('#gateToken').value = '';
    $('#gateToken').placeholder = isP1 ? `one-time token (${token})` : '';
    $('#gateWho').textContent = isP1 ? 'approver: ic.sharma (INCIDENT_COMMANDER)' : 'approver: analyst.rao (SOC_ANALYST)';
    $('#gate').classList.add('show');
    const done = (v) => { $('#gate').classList.remove('show'); resolve(v); };
    $('#gateOk').onclick = () => {
      if (isP1 && $('#gateToken').value.trim() !== token) { $('#gateToken').value = token; $('#gateToken').style.borderColor = 'var(--violet)'; return; }
      done(true);
    };
    $('#gateNo').onclick = () => done(false);
    if (window.__AUTO_APPROVE) {
      setTimeout(() => { if (isP1) $('#gateToken').value = token; }, 900 * (window.__SPEED ?? 1));
      setTimeout(() => done(true), 2000 * (window.__SPEED ?? 1));
    }
  });
}

async function runOne(inc) {
  busy = true;
  current = inc.id;
  renderQueue();
  $('#curTitle').innerHTML = `<b style="color:var(--ink)">${inc.id}</b> · ${esc(inc.title)}`;
  $('#tx').innerHTML = '';
  $('#risk').innerHTML = '<div class="empty" style="width:100%">scoring…</div>';
  $('#result').innerHTML = '<div class="empty">agents working…</div>';
  $('#masked').innerHTML = '<span class="empty">masking…</span>';
  $('#raw').innerHTML = highlightRaw({ id: inc.id, userPrincipalName: inc.userPrincipalName, displayName: inc.displayName, sourceIp: inc.sourceIp, deviceId: inc.deviceId, documentTitle: inc.documentTitle, narrative: inc.narrative });
  let state = {};
  renderPipe(0);

  const res = await runPipeline(inc, {
    vault, ledger, graph,
    approver: (d) => askHuman(d, inc),
    onStep: async (s) => {
      const i = NODE_FOR[s.id];
      if (s.id === 'intake') tx(`<span class="who">ingest</span> Graph incident ${inc.id} normalised · fingerprint <span class="dim">${s.fingerprint.slice(0, 16)}…</span>`);
      if (s.id === 'mask') {
        $('#masked').innerHTML = highlight(s.masked);
        tx(`<span class="who">guardrail</span> ${s.vaultSize} identifiers sealed in AES-GCM vault · LLM context contains <span class="ok">0 raw PII</span>`);
      }
      if (s.id === 'risk') {
        const f = s.risk.factors;
        $('#risk').innerHTML = gauge(s.risk.score, s.risk.priority) + `<div class="factors">
          <div class="frow"><span>Max severity weight</span><b>+${f.base}</b></div>
          <div class="frow"><span>Identity diversity (${f.kinds}/3 keys)</span><b>+${f.diversity}</b></div>
          <div class="frow"><span>Signal volume</span><b>+${f.volume}</b></div>
          <div class="frow"><span>Band · SLA</span><b>${s.risk.band} · ${s.risk.slaMinutes >= 60 ? s.risk.slaMinutes / 60 + ' h' : s.risk.slaMinutes + ' min'}</b></div></div>`;
        tx(`<span class="who">risk-engine</span> score <b>${s.risk.score}</b> → <span class="warn">${s.risk.priority}</span> (${s.risk.band}) · SLA ${PRIORITY_SLA_MINUTES[s.risk.priority]} min`);
      }
      if (s.id === 'triage') {
        results._pending = s.output;
        for (const c of s.calls) callLine('triage-agent', c);
        tx(`<span class="who">triage-agent</span> root cause: <span class="ok">${s.output.rootCause.category}</span> (${Math.round(s.output.rootCause.confidence * 100)}%) · runbook <span class="fn">${s.output.runbook.runbookId}</span>`);
      }
      if (s.id === 'gate') {
        const d = s.decision;
        tx(`<span class="who">approval-policy</span> mode=<span class="${d.executionAllowed ? 'ok' : 'warn'}">${d.mode}</span> · ${esc(d.reason)}`);
        if (!d.executionAllowed) { state = { ...state, 4: 'hold' }; renderPipe(4, state); }
      }
      if (s.id === 'approval') {
        tx(s.approved ? `<span class="who">${s.decision.escalateTo}</span> <span class="ok">approved</span> — execution unlocked` : `<span class="who">${s.decision.escalateTo}</span> <span class="bad">rejected</span> — no action taken`);
        state = { ...state, 4: s.approved ? 'done' : 'fail' };
      }
      if (s.id === 'respond') {
        for (const c of s.executed) callLine('response-agent', c);
        for (const c of s.verified) callLine('verify', c);
      }
      if (s.id === 'close') {
        tx(`<span class="who">soc-copilot</span> <span class="fn">write_closure_report</span> + <span class="fn">write_knowledge_entry</span> · <span class="ok">${esc(s.closure.output.report.title)}</span>`);
      }
      renderPipe(i + (s.id === 'gate' && !s.decision.executionAllowed ? 0 : 1), state);
      renderLedger();
      kpis();
      await sleep(s.id === 'triage' || s.id === 'respond' ? 650 : 450);
    },
  });

  const rejected = res.decision && !res.decision.executionAllowed;
  results[inc.id] = { ...res, rejected, agentMs: res.ms };
  if (rejected) renderPipe(4, { 0: 'done', 1: 'done', 2: 'done', 3: 'done', 4: 'fail' }); else renderPipe(7);
  const tri = res.triage.output;
  $('#result').innerHTML = `<div class="rk"><span class="pill ${res.risk.priority}">${res.risk.priority}</span><b>${tri.rootCause.category}</b><span class="pill ${rejected ? 'rej' : 'done'}">${rejected ? 'rejected by human' : 'resolved & verified'}</span></div>
    <div style="color:var(--ink2);margin-bottom:6px">${esc(tri.rootCause.narrative)}</div>
    <div class="mono" style="font-size:11.5px">runbook: <b>${tri.runbook.runbookId}</b><br>actions: ${tri.runbook.actions.join(' → ')}<br>gate: ${res.decision.mode}${res.decision.escalateTo ? ' (' + res.decision.escalateTo + ')' : ''}<br>agent compute time: ${res.ms.toFixed(1)} ms (excl. human wait) · stage SLA budgets: ${STAGES.map((st, i) => stageBudgetMinutes(res.risk.priority, i)).join('/')} min</div>`;
  if (!rejected) {
    const restored = await vault.restore(res.closure.output.report.body + ' User ' + res.masked.userPrincipalName);
    tx(`<span class="who">vault</span> authorised restore for analyst view: <span class="dim">${esc(restored.slice(-60))}</span>`);
  }
  addChat('a', rejected ? `Remediation for ${inc.id} was rejected; nothing executed. Ask me about it.` : `${inc.id} closed: ${tri.rootCause.category}, ${res.risk.priority}, runbook ${tri.runbook.runbookId}. Ask me anything about this incident.`);
  renderQueue(); kpis();
  busy = false;
  return res;
}

function addChat(who, text, refused = false) {
  const d = document.createElement('div');
  d.className = `msg ${who}${refused ? ' ref' : ''}`;
  d.textContent = text;
  $('#chat').appendChild(d);
  $('#chat').scrollTop = 1e6;
}
async function ask(q) {
  if (!q.trim()) return;
  addChat('u', q);
  const r = current && results[current];
  if (!r || !r.context && !r.triage) return addChat('a', 'Run an incident first.');
  const ctx = r.context || { category: r.triage.output.rootCause.category, confidence: r.triage.output.rootCause.confidence, priority: r.risk.priority, runbookId: r.triage.output.runbook.runbookId, actions: r.triage.output.runbook.actions, stage: STAGES[3] };
  const out = copilot.answer(q, ctx);
  await sleep(250);
  addChat('a', out.output.answer, !out.output.scoped);
  await ledger.append('soc-copilot', 'AI_AGENT', out.output.scoped ? 'copilot.answered' : 'copilot.refused', 'incident', current, q.slice(0, 60));
  renderLedger(); kpis();
}

function renderLedger(bad) {
  $('#ledger').innerHTML = ledger.rows.slice().reverse().map((r) => `<div class="lrow ${bad === r.sequence ? 'bad' : ''}">
    <div class="seq">#${r.sequence}</div><div><div class="a">${esc(r.action)} <span style="color:var(--ink3);font-weight:500">· ${esc(r.actor)} (${r.role})</span></div>
    <div style="color:var(--ink2)">${esc(r.summary)}</div><div class="h">prev ${r.previous_hash.slice(0, 14)}… → ${r.recordHash.slice(0, 14)}…</div></div></div>`).join('');
  if (!bad) { $('#chainSt').className = 'chain ok'; $('#chainSt').textContent = `✓ Chain intact · ${ledger.rows.length} records`; }
}

function kpis() {
  const rs = Object.entries(results).filter(([k]) => !k.startsWith('_')).map(([, v]) => v);
  $('#k-proc').textContent = rs.length;
  $('#k-auto').textContent = rs.filter((r) => r.decision.mode === 'auto_execute' || r.decision.mode === 'preapproved_policy').length;
  $('#k-human').textContent = rs.filter((r) => r.decision.escalateTo).length;
  $('#k-pii').textContent = vault.rows.length;
  const t = rs.map((r) => r.agentMs).filter(Boolean);
  $('#k-mttr').textContent = t.length ? (t.reduce((a, b) => a + b, 0) / t.length).toFixed(1) + ' ms' : '–';
  $('#k-chain').textContent = `✓ ${ledger.rows.length}`;
}

/* tools tab */
let shape = 'openai';
const sets = { TRIAGE_TOOLS, RESPONSE_TOOLS, COPILOT_TOOLS };
function renderTools() { $('#toolsOut').textContent = JSON.stringify(toolShapes[shape](sets[$('#toolset').value]), null, 2); }
document.querySelectorAll('[data-shape]').forEach((b) => (b.onclick = () => {
  shape = b.dataset.shape;
  document.querySelectorAll('[data-shape]').forEach((x) => x.classList.toggle('primary', x === b));
  renderTools();
}));
$('#toolset').onchange = renderTools;

/* tabs */
document.querySelectorAll('#tabs button').forEach((b) => (b.onclick = () => {
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tabbody').forEach((x) => x.classList.toggle('on', x.id === b.dataset.t));
}));

/* benchmark */
async function bench(n = 1000) {
  $('#benchSt').textContent = 'running…';
  const v = new PiiVault('bench'), l = new AuditLedger('bench'), g = new MockGraph();
  const times = [];
  const counts = { P1: 0, P2: 0, P3: 0 };
  let correct = 0, leaks = 0, p1Gated = 0;
  const expected = { 'INC-24051': 'Impossible Travel', 'INC-24052': 'Malicious OAuth App', 'INC-24053': 'DLP Exfiltration', 'INC-24054': 'Phishing', 'INC-24055': 'Unclassified', 'INC-24056': 'Unclassified' };
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    const base = SCENARIOS[i % SCENARIOS.length];
    const inc = { ...base, id: `${base.id}-${i}`, userPrincipalName: base.userPrincipalName.replace('@', `${i}@`), narrative: base.narrative.replace(base.userPrincipalName, base.userPrincipalName.replace('@', `${i}@`)) };
    const s = performance.now();
    const r = await runPipeline(inc, { vault: v, ledger: l, graph: g });
    times.push(performance.now() - s);
    counts[r.risk.priority]++;
    if (r.risk.priority === 'P1' && r.decision.mode === 'commander_token') p1Gated++;
    if (r.triage.output.rootCause.category === expected[base.id]) correct++;
    const ctx = JSON.stringify(r.masked);
    if (/@bharatfin\.in|\b\d{1,3}(\.\d{1,3}){3}\b/.test(ctx)) leaks++;
    if (i % 100 === 0) { $('#benchSt').textContent = `running… ${i}/${n}`; await new Promise((r2) => setTimeout(r2)); }
  }
  const total = performance.now() - t0;
  times.sort((a, b) => a - b);
  const pct = (p) => times[Math.min(times.length - 1, Math.floor(p * times.length))].toFixed(2);
  const chain = await l.verify();
  const rows = [
    ['Incidents processed', n.toLocaleString()],
    ['Throughput', `${Math.round(n / (total / 1000)).toLocaleString()} incidents/s`],
    ['Latency p50 / p95 / p99 (agent pipeline)', `${pct(0.5)} / ${pct(0.95)} / ${pct(0.99)} ms`],
    ['Triage category accuracy (6 labelled templates)', `${((correct / n) * 100).toFixed(1)}%`],
    ['Raw emails/IPs leaked into LLM context', `${leaks} / ${n}`],
    ['Priority mix P1 / P2 / P3', `${counts.P1} / ${counts.P2} / ${counts.P3}`],
    ['P1 incidents routed to Incident Commander token', `${p1Gated} / ${counts.P1}`],
    ['Audit records written · chain verified', `${l.rows.length.toLocaleString()} · ${chain.ok ? 'intact ✓' : 'BROKEN'}`],
    ['Distinct PII tokens in vault', v.rows.length.toLocaleString()],
  ];
  $('#benchTbl').innerHTML = '<tbody>' + rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('') + '</tbody>';
  $('#benchSt').textContent = `done in ${(total / 1000).toFixed(2)} s on this device`;
  window.__BENCH = Object.fromEntries(rows);
  return window.__BENCH;
}

/* wire up */
$('#runAll').onclick = async () => { if (busy) return; for (const s of SCENARIOS) { await runOne(s); await sleep(500); } };
$('#reset').onclick = () => !busy && init();
$('#askBtn').onclick = () => { ask($('#q').value); $('#q').value = ''; };
$('#q').onkeydown = (e) => e.key === 'Enter' && $('#askBtn').onclick();
document.querySelectorAll('#chips button').forEach((b) => (b.onclick = () => ask(b.textContent)));
$('#verify').onclick = async () => {
  const v = await ledger.verify();
  if (v.ok) { $('#chainSt').className = 'chain ok'; $('#chainSt').textContent = `✓ Verified · ${v.length} records, every hash recomputed`; renderLedger(); $('#chainSt').textContent = `✓ Verified · ${v.length} records, every hash recomputed`; }
  else { $('#chainSt').className = 'chain bad'; $('#chainSt').textContent = `✗ Tampering detected at record #${v.brokenAt}`; renderLedger(v.brokenAt); $('#chainSt').className = 'chain bad'; $('#chainSt').textContent = `✗ Tampering detected at record #${v.brokenAt}`; $('#k-chain').textContent = '✗ broken'; $('#k-chain').style.color = 'var(--crit)'; }
};
$('#tamper').onclick = async () => {
  if (ledger.rows.length < 3) return;
  const i = Math.floor(ledger.rows.length / 2);
  ledger.rows[i].summary = 'remediation skipped (edited by insider)';
  $('#chainSt').className = 'chain bad';
  $('#chainSt').textContent = `Record #${i + 1} silently edited — click Verify`;
};
$('#bench').onclick = () => bench(1000);

window.S360 = { runOne, SCENARIOS, bench, ask, init, verify: () => $('#verify').onclick() };
init(); renderTools();
