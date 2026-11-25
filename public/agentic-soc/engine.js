/**
 * Secure360 Hub — Agentic SOC engine (browser + Node, zero dependencies).
 *
 * A faithful JavaScript port of the Secure360 Hub FastAPI backend
 * (backend/app/...) so the full agentic pipeline can run live in a browser
 * on GitHub Pages without a server:
 *
 *   ingest (any connector: IdP, cloud, EDR, SaaS, SIEM) -> PII guardrail vault -> risk score & priority
 *   -> Triage/Investigation agent -> approval gate (human-in-the-loop)
 *   -> Response/Execution agent (+ Graph verification) -> SOC Copilot
 *   -> closure report & KB entry, all written to a SHA-256 hash-chained audit log.
 *
 * Python sources mirrored:
 *   processing/engine.py       assessRisk, priorityFor, fingerprint
 *   governance/guardrails.py   PiiMasker (HMAC blind index + encrypted vault)
 *   governance/approval_policy.py  evaluateApproval
 *   governance/audit.py        canonicalBody, computeRecordHash, verifyChain
 *   agents/soc_agents.py       classifyCategory, recommendRunbook, agents, tool specs
 *   workflow/state_machine.py  6-stage ticket lifecycle with SLA budgets
 */

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();

/* ------------------------------------------------------------------ crypto */
export async function sha256Hex(text) {
  const buf = await subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(keyBytes, text) {
  const key = await subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await subtle.sign('HMAC', key, enc.encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function b64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

/* --------------------------------------------------------------- patterns */
const EMAIL = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
const IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;
const NAME_FIELDS = new Set(['displayname', 'username', 'actorname', 'assignedto', 'name']);
const DOC_FIELDS = new Set(['documenttitle', 'filename', 'title']);
const PREFIX = { user: 'USER', ip: 'IP', name: 'NAME', doc: 'DOC' };

/* ---------------------------------------------------- PII guardrail vault */
/**
 * Rewrites telemetry to reversible placeholders before anything reaches an LLM.
 * Plaintext is sealed with AES-GCM in a tenant-scoped vault; the index is an
 * HMAC blind index so repeated values reuse the same token with no plaintext
 * in the index. Mirrors governance/guardrails.py::PiiMasker.
 */
export class PiiVault {
  constructor(tenantId = 'contoso-in') {
    this.tenantId = tenantId;
    this.macKey = globalThis.crypto.getRandomValues(new Uint8Array(32));
    this.aesKeyPromise = subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    this.rows = []; // { tenant, entity, token, blind, iv, ciphertext }
    this.counters = { user: 0, ip: 0, name: 0, doc: 0 };
  }

  async tokenFor(entity, value) {
    const blind = await hmacHex(this.macKey, `${this.tenantId}|${entity}|${value}`);
    const hit = this.rows.find((r) => r.entity === entity && r.blind === blind);
    if (hit) return hit.token;
    this.counters[entity] += 1;
    const token = `[${PREFIX[entity]}_${String(this.counters[entity]).padStart(2, '0')}]`;
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const key = await this.aesKeyPromise;
    const sealed = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(`${this.tenantId}\n${value}`));
    this.rows.push({ tenant: this.tenantId, entity, token, blind, iv, ciphertext: b64(new Uint8Array(sealed)) });
    return token;
  }

  async maskString(key, value) {
    let text = await this.#replace(EMAIL, value, 'user');
    text = await this.#replace(IPV4, text, 'ip');
    const k = key.toLowerCase();
    if (NAME_FIELDS.has(k) && text && !text.startsWith('[')) text = await this.tokenFor('name', text);
    if (DOC_FIELDS.has(k) && text && !text.startsWith('[')) text = await this.tokenFor('doc', text);
    return text;
  }

  async #replace(pattern, text, entity) {
    const matches = [...text.matchAll(pattern)];
    if (!matches.length) return text;
    let out = '';
    let cursor = 0;
    for (const m of matches) {
      out += text.slice(cursor, m.index) + (await this.tokenFor(entity, m[0]));
      cursor = m.index + m[0].length;
    }
    return out + text.slice(cursor);
  }

  async mask(payload) {
    const walk = async (node) => {
      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
          node[i] = typeof node[i] === 'string' ? await this.maskString('', node[i]) : await walk(node[i]);
        }
        return node;
      }
      if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
          node[k] = typeof v === 'string' ? await this.maskString(k, v) : await walk(v);
        }
      }
      return node;
    };
    return walk(structuredClone(payload));
  }

  async restore(text) {
    const key = await this.aesKeyPromise;
    const parts = [];
    let cursor = 0;
    for (const m of text.matchAll(/\[(?:USER|IP|NAME|DOC)_\d{2,}\]/g)) {
      parts.push(text.slice(cursor, m.index));
      const row = this.rows.find((r) => r.token === m[0] && r.tenant === this.tenantId);
      if (!row) parts.push(m[0]);
      else {
        const bytes = Uint8Array.from(atob(row.ciphertext), (c) => c.charCodeAt(0));
        const plain = new TextDecoder().decode(await subtle.decrypt({ name: 'AES-GCM', iv: row.iv }, key, bytes));
        const [tenant, value] = plain.split('\n');
        parts.push(tenant === this.tenantId ? value : m[0]);
      }
      cursor = m.index + m[0].length;
    }
    parts.push(text.slice(cursor));
    return parts.join('');
  }
}

/* ------------------------------------------------------- risk & priority */
export const SEVERITY_WEIGHT = { critical: 70, high: 50, medium: 30, low: 15, informational: 5 };
export const PRIORITY_SLA_MINUTES = { P1: 15, P2: 120, P3: 24 * 60 };

export function priorityFor(score) {
  const s = Math.max(0, Math.min(100, Math.trunc(score)));
  if (s >= 80) return { score: s, priority: 'P1', band: 'CRITICAL', slaMinutes: 15 };
  if (s >= 40) return { score: s, priority: 'P2', band: 'HIGH/MEDIUM', slaMinutes: 120 };
  return { score: s, priority: 'P3', band: 'LOW/ROUTINE', slaMinutes: 1440 };
}

/** processing/engine.py::assess_risk — severity + identity-key diversity + volume. */
export function assessRisk(signals) {
  if (!signals.length) return { ...priorityFor(0), factors: { base: 0, diversity: 0, volume: 0 } };
  const base = Math.max(...signals.map((s) => SEVERITY_WEIGHT[s.severity] ?? 5));
  let kinds = 0;
  if (signals.some((s) => s.user)) kinds++;
  if (signals.some((s) => s.ip)) kinds++;
  if (signals.some((s) => s.device)) kinds++;
  let diversity = kinds >= 2 ? 15 : 0;
  if (kinds === 3) diversity += 15;
  const volume = Math.min(Math.max(signals.length - 1, 0), 5) * 4;
  return { ...priorityFor(Math.min(100, base + diversity + volume)), factors: { base, diversity, volume, kinds } };
}

export async function eventFingerprint(tenant, provider, alertId, occurredAt) {
  const bucket = Math.floor(new Date(occurredAt).getTime() / 1000 / 60);
  return sha256Hex(`${tenant}|${provider}|${alertId}|${bucket}`);
}

/* ---------------------------------------------------------- tool specs */
const obj = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false });
const str = { type: 'string' };

export const TRIAGE_TOOLS = [
  { name: 'classify_category', description: 'Classify one masked incident narrative into a SOC category.', parameters: obj({ narrative: str }, ['narrative']) },
  { name: 'query_user_context', description: 'Read correlated user context already stored for this incident.', parameters: obj({ user: str }, ['user']) },
  { name: 'query_file_context', description: 'Read correlated file context already stored for this incident.', parameters: obj({ document: str }, ['document']) },
  { name: 'query_device_context', description: 'Read correlated device context already stored for this incident.', parameters: obj({ device: str }, ['device']) },
];
export const RESPONSE_TOOLS = [
  { name: 'revokeSignInSessions', description: 'Revoke all sign-in sessions for one masked user at the identity provider (Okta, Entra ID, Google Workspace).', parameters: obj({ userId: str }, ['userId']) },
  { name: 'disableUser', description: 'Suspend one masked user at the identity provider or SaaS tenant.', parameters: obj({ userId: str }, ['userId']) },
  { name: 'isolateDevice', description: 'Network-isolate one managed device through the EDR connector (CrowdStrike, Defender, SentinelOne).', parameters: obj({ deviceId: str }, ['deviceId']) },
  { name: 'patchIncident', description: 'Set the source incident status and classification (SIEM, EDR, SaaS or ITSM ticket).', parameters: obj({ incidentId: str, status: str, classification: str }, ['incidentId', 'status', 'classification']) },
  { name: 'enrichAlert', description: 'Attach stored correlation context to the incident.', parameters: obj({ incidentId: str }, ['incidentId']) },
  { name: 'notifyUser', description: 'Queue a standard notice to the masked user.', parameters: obj({ userId: str }, ['userId']) },
  { name: 'graphGet', description: 'Read back user, device, or incident state from the source connector after remediation.', parameters: obj({ resource: { type: 'string', enum: ['user', 'device', 'incident'] }, id: str }, ['resource', 'id']) },
];
export const COPILOT_TOOLS = [
  { name: 'answer_incident_query', description: 'Answer one analyst question using only the current incident context.', parameters: obj({ question: str, context: { type: 'object' } }, ['question', 'context']) },
  { name: 'write_closure_report', description: 'Write a masked post-closure audit report.', parameters: obj({ context: { type: 'object' } }, ['context']) },
  { name: 'write_knowledge_entry', description: 'Write a masked knowledge-base entry.', parameters: obj({ context: { type: 'object' } }, ['context']) },
];

/** Same tools exported in the three major LLM SDK shapes (model-agnostic). */
export const toolShapes = {
  openai: (specs) => specs.map((s) => ({ type: 'function', function: { name: s.name, description: s.description, parameters: s.parameters } })),
  anthropic: (specs) => specs.map((s) => ({ name: s.name, description: s.description, input_schema: s.parameters })),
  bedrock: (specs) => specs.map((s) => ({ toolSpec: { name: s.name, description: s.description, inputSchema: { json: s.parameters } } })),
};

/* --------------------------------------------------------------- agents */
export const RUNBOOK_ACTIONS = {
  revoke_sessions: ['revokeSignInSessions', 'patchIncident'],
  disable_user: ['disableUser', 'revokeSignInSessions', 'patchIncident'],
  isolate_device: ['isolateDevice', 'patchIncident'],
  alert_enrichment: ['enrichAlert'],
  user_notification: ['notifyUser'],
  false_positive_closure: ['patchIncident'],
};

export function classifyCategory(narrative) {
  const t = narrative.toLowerCase();
  if (t.includes('impossible travel') || t.includes('atypical travel')) return ['Impossible Travel', 0.92];
  if (t.includes('oauth') || t.includes('illicit consent') || t.includes('malicious app')) return ['Malicious OAuth App', 0.9];
  if (t.includes('dlp') || t.includes('exfiltration')) return ['DLP Exfiltration', 0.9];
  if (t.includes('phish')) return ['Phishing', 0.86];
  return ['Unclassified', 0.55];
}

export function recommendRunbook(category, priority, narrative) {
  const t = narrative.toLowerCase();
  let id;
  let rationale;
  if (priority === 'P3' || t.includes('false positive')) {
    if (t.includes('false positive')) { id = 'false_positive_closure'; rationale = 'P3 or an explicit false-positive statement uses the closure runbook.'; }
    else if (t.includes('notify')) { id = 'user_notification'; rationale = 'The narrative asks for a user notice and does not require containment.'; }
    else { id = 'alert_enrichment'; rationale = 'Low-risk intake is enriched and then verified.'; }
  } else if (t.includes('notify') && category === 'Unclassified') {
    id = 'user_notification'; rationale = 'Unclassified P2 notice matches the pre-approved notification policy.';
  } else {
    id = { 'Impossible Travel': 'revoke_sessions', 'Malicious OAuth App': 'disable_user', 'DLP Exfiltration': 'isolate_device', Phishing: 'disable_user', Unclassified: 'alert_enrichment' }[category];
    rationale = `${category} maps to ${id}.`;
  }
  return { runbookId: id, actions: RUNBOOK_ACTIONS[id], rationale };
}

export class TriageInvestigationAgent {
  plan(m) {
    return [
      { name: 'classify_category', arguments: { narrative: m.narrative } },
      { name: 'query_user_context', arguments: { user: m.userPrincipalName || '' } },
      { name: 'query_file_context', arguments: { document: m.documentTitle || '' } },
      { name: 'query_device_context', arguments: { device: m.deviceId || '' } },
    ];
  }
  investigate(m, context) {
    const [category, confidence] = classifyCategory(m.narrative || '');
    const runbook = recommendRunbook(category, m.priority, m.narrative || '');
    return {
      calls: this.plan(m),
      output: {
        rootCause: {
          category, confidence,
          narrative: `${category} at ${m.priority}. ${runbook.rationale}`,
          evidence: [`user=${context.user || 'none'}`, `files=${context.files || 'none'}`, `device=${context.device || 'none'}`],
        },
        runbook,
      },
    };
  }
}

export class ResponseExecutionAgent {
  plan(m, actions) {
    const classification = m.runbookId === 'false_positive_closure' ? 'falsePositive' : 'truePositive';
    return actions.map((a) => {
      if (['revokeSignInSessions', 'disableUser', 'notifyUser'].includes(a)) return { name: a, arguments: { userId: m.userPrincipalName } };
      if (a === 'isolateDevice') return { name: a, arguments: { deviceId: m.deviceId } };
      if (a === 'patchIncident') return { name: a, arguments: { incidentId: m.incidentId, status: 'resolved', classification } };
      return { name: a, arguments: { incidentId: m.incidentId } };
    });
  }
  verificationCalls(executed) {
    return executed.map((c) => {
      if (['revokeSignInSessions', 'disableUser', 'notifyUser'].includes(c.name)) return { name: 'graphGet', arguments: { resource: 'user', id: c.arguments.userId } };
      if (c.name === 'isolateDevice') return { name: 'graphGet', arguments: { resource: 'device', id: c.arguments.deviceId } };
      return { name: 'graphGet', arguments: { resource: 'incident', id: c.arguments.incidentId } };
    });
  }
}

export class SocCopilotAgent {
  answer(question, context) {
    const call = { name: 'answer_incident_query', arguments: { question, context } };
    if (outsideContext(question, context)) return { calls: [call], output: { scoped: false, answer: 'That question is outside this incident. Request refused by the scope guardrail.' } };
    return { calls: [call], output: { scoped: true, answer: answerFromContext(question, context) } };
  }
  close(context) {
    return {
      calls: [{ name: 'write_closure_report', arguments: { context } }, { name: 'write_knowledge_entry', arguments: { context } }],
      output: {
        report: { title: `${context.category} closed`, body: `Priority ${context.priority} category ${context.category} closed with runbook ${context.runbookId} after Graph verification.` },
        knowledge: { title: context.category, body: `Runbook ${context.runbookId} was verified for ${context.category} at ${context.priority}.` },
      },
    };
  }
}

function outsideContext(question, context) {
  const q = question.toLowerCase();
  if (['password', 'secret', 'credential', 'all tenants', 'other tenant'].some((w) => q.includes(w))) return true;
  const hay = JSON.stringify(context);
  for (const p of [EMAIL, IPV4]) for (const m of question.matchAll(p)) if (!hay.includes(m[0])) return true;
  for (const m of question.matchAll(/\[(?:USER|IP|NAME|DOC)_\d{2,}\]/g)) if (!hay.includes(m[0])) return true;
  return false;
}

function answerFromContext(question, c) {
  const q = question.toLowerCase();
  if (q.includes('category')) return `Category is ${c.category} (confidence ${Math.round(c.confidence * 100)}%).`;
  if (q.includes('runbook') || q.includes('recommend')) return `Recommended runbook is ${c.runbookId}: ${c.actions.join(' → ')}.`;
  if (q.includes('priority') || q.includes('sla')) return `Priority is ${c.priority} with a ${PRIORITY_SLA_MINUTES[c.priority]}-minute SLA; current stage ${c.stage}.`;
  if (q.includes('status') || q.includes('stage')) return `Stage is ${c.stage}.`;
  return `This incident is ${c.category} at ${c.priority}, stage ${c.stage}, runbook ${c.runbookId}.`;
}

/* ------------------------------------------------------- approval policy */
const LOW_RISK_RUNBOOKS = new Set(['alert_enrichment', 'user_notification', 'false_positive_closure']);
const PREAPPROVED = { 'preapproved-user-notification': ['user_notification'], 'preapproved-enrichment': ['alert_enrichment', 'false_positive_closure'] };

function matchingPolicy(priority, runbookId) {
  if (!['P2', 'P3'].includes(priority)) return null;
  for (const [id, rbs] of Object.entries(PREAPPROVED)) if (rbs.includes(runbookId)) return id;
  return null;
}

/** governance/approval_policy.py::evaluate — P1 commander token, P2 analyst/pre-approved, P3 low-risk auto. */
export function evaluateApproval(priority, runbookId, approved = false) {
  if (priority === 'P1') return { mode: 'commander_token', executionAllowed: approved, escalateTo: 'INCIDENT_COMMANDER', policyId: null, reason: 'P1 blocks automated execution until an Incident Commander submits a one-time approval token' };
  if (priority === 'P2') {
    const m = matchingPolicy(priority, runbookId);
    if (m) return { mode: 'preapproved_policy', executionAllowed: true, escalateTo: null, policyId: m, reason: 'P2 runbook matches a pre-approved policy' };
    return { mode: 'analyst_click', executionAllowed: approved, escalateTo: 'SOC_ANALYST', policyId: null, reason: 'P2 waits for analyst approval or a matching pre-approved policy' };
  }
  if (LOW_RISK_RUNBOOKS.has(runbookId)) return { mode: 'auto_execute', executionAllowed: true, escalateTo: null, policyId: matchingPolicy('P3', runbookId), reason: 'P3 low-risk runbook auto-executes and must pass a Graph GET check' };
  return { mode: 'analyst_click', executionAllowed: approved, escalateTo: 'SOC_ANALYST', policyId: null, reason: 'P3 runbook is outside the low-risk auto-execute set' };
}

/* --------------------------------------------------------- ticket workflow */
export const STAGES = ['1. INTAKE', '2. AI TRIAGE', '3. INVESTIGATE', '4. ASSIGN', '5. RESOLVE', '6. VERIFY & CLOSE'];
const STAGE_WEIGHT = [1, 2, 3, 2, 4, 1];
export function stageBudgetMinutes(priority, stageIndex) {
  return Math.max(1, Math.round((PRIORITY_SLA_MINUTES[priority] * STAGE_WEIGHT[stageIndex]) / 13));
}

/* ------------------------------------------------------------ audit chain */
export const GENESIS = '0'.repeat(64);
export const canonicalBody = (fields) => JSON.stringify(sortKeys(fields));
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}
export const computeRecordHash = (prev, fields) => sha256Hex(prev + canonicalBody(fields));

export class AuditLedger {
  constructor(tenantId = 'contoso-in') { this.tenantId = tenantId; this.rows = []; }
  async append(actor, role, action, targetType, targetId, summary) {
    const previous = this.rows.length ? this.rows[this.rows.length - 1].recordHash : GENESIS;
    const body = { action, actor, created_at: new Date().toISOString(), previous_hash: previous, role, sequence: this.rows.length + 1, summary, target_id: targetId, target_type: targetType, tenant_id: this.tenantId };
    const row = { ...body, recordHash: await computeRecordHash(previous, body) };
    this.rows.push(row);
    return row;
  }
  async verify() {
    let prev = GENESIS;
    for (let i = 0; i < this.rows.length; i++) {
      const { recordHash, ...body } = this.rows[i];
      if (body.sequence !== i + 1 || body.previous_hash !== prev) return { ok: false, brokenAt: i + 1 };
      if ((await computeRecordHash(body.previous_hash, body)) !== recordHash) return { ok: false, brokenAt: i + 1 };
      prev = recordHash;
    }
    return { ok: true, length: this.rows.length };
  }
}

/* ------------------------------------------------------------ mock Graph */
export class MockGraph {
  constructor() { this.users = {}; this.devices = {}; this.incidents = {}; }
  call(name, args) {
    switch (name) {
      case 'revokeSignInSessions': (this.users[args.userId] ??= {}).sessionsRevoked = true; return { status: 204 };
      case 'disableUser': (this.users[args.userId] ??= {}).accountEnabled = false; return { status: 204 };
      case 'notifyUser': (this.users[args.userId] ??= {}).noticeQueued = true; return { status: 202 };
      case 'isolateDevice': (this.devices[args.deviceId] ??= {}).isolation = 'Isolated'; return { status: 201 };
      case 'patchIncident': Object.assign((this.incidents[args.incidentId] ??= {}), { status: args.status, classification: args.classification }); return { status: 200 };
      case 'enrichAlert': (this.incidents[args.incidentId] ??= {}).enriched = true; return { status: 200 };
      case 'graphGet': {
        const map = { user: this.users, device: this.devices, incident: this.incidents };
        return { status: 200, body: map[args.resource][args.id] || {} };
      }
      default: return { status: 400 };
    }
  }
}

/* ------------------------------------------------------ end-to-end pipeline */
/**
 * Runs one incident through the whole agentic flow. `onStep` streams each
 * step to the UI. `approver(decision)` resolves true/false for human gates.
 */
export async function runPipeline(incident, { vault, ledger, graph, onStep = () => {}, approver = async () => true } = {}) {
  vault ??= new PiiVault();
  ledger ??= new AuditLedger();
  graph ??= new MockGraph();
  const t0 = performance.now();
  let paused = 0; // time spent in UI callbacks / waiting on humans (excluded from agent time)
  const step = async (id, data) => { const s = performance.now(); await onStep({ id, ...data }); paused += performance.now() - s; };
  const elapsed = () => performance.now() - t0 - paused;
  const triage = new TriageInvestigationAgent();
  const responder = new ResponseExecutionAgent();
  const copilot = new SocCopilotAgent();

  // 1. INTAKE — normalise + fingerprint
  const fp = await eventFingerprint(vault.tenantId, incident.source || 'connector', incident.id, incident.createdDateTime);
  await ledger.append('ingestion-pipeline', 'SYSTEM', 'incident.ingested', 'incident', incident.id, `${incident.source || 'connector'} incident ingested fp=${fp.slice(0, 12)}`);
  await step('intake', { stage: 0, fingerprint: fp, raw: incident, source: incident.source });

  // 2. GUARDRAIL — mask before the LLM ever sees it
  const masked = await vault.mask({
    incidentId: incident.id,
    userPrincipalName: incident.userPrincipalName,
    displayName: incident.displayName,
    sourceIp: incident.sourceIp,
    deviceId: incident.deviceId,
    documentTitle: incident.documentTitle || '',
    narrative: incident.narrative,
  });
  await ledger.append('guardrail', 'SYSTEM', 'pii.masked', 'incident', incident.id, `${vault.rows.length} vault entries sealed (AES-GCM, HMAC index)`);
  await step('mask', { masked, vaultSize: vault.rows.length });

  // 3. RISK — correlate signals, score, priority & SLA
  const risk = assessRisk(incident.signals);
  masked.priority = risk.priority;
  await ledger.append('processing-engine', 'SYSTEM', 'risk.scored', 'incident', incident.id, `score=${risk.score} ${risk.priority}`);
  await step('risk', { risk, stage: 1 });

  // 4. TRIAGE AGENT — tool-calling investigation
  const context = { user: masked.userPrincipalName, files: masked.documentTitle || 'none', device: masked.deviceId };
  const tri = triage.investigate(masked, context);
  masked.runbookId = tri.output.runbook.runbookId;
  await ledger.append('triage-agent', 'AI_AGENT', 'triage.completed', 'incident', incident.id, `${tri.output.rootCause.category} -> ${masked.runbookId}`);
  await step('triage', { calls: tri.calls, output: tri.output, stage: 2 });

  // 5. APPROVAL GATE — human-in-the-loop by risk
  let decision = evaluateApproval(risk.priority, masked.runbookId, false);
  await step('gate', { decision, stage: 3 });
  if (!decision.executionAllowed) {
    const w = performance.now();
    const ok = await approver(decision);
    paused += performance.now() - w;
    decision = evaluateApproval(risk.priority, masked.runbookId, ok);
    await ledger.append(decision.escalateTo === 'INCIDENT_COMMANDER' ? 'ic.sharma' : 'analyst.rao', decision.escalateTo, ok ? 'remediation.approved' : 'remediation.rejected', 'incident', incident.id, decision.mode);
    await step('approval', { decision, approved: ok });
    if (!ok) return { incident, masked, risk, triage: tri, decision, executed: [], verified: [], ms: elapsed(), ledger, vault };
  } else {
    await ledger.append('approval-policy', 'SYSTEM', 'remediation.auto_approved', 'incident', incident.id, decision.mode);
  }

  // 6. RESPONSE AGENT — execute + verify via Graph GET
  const planned = responder.plan(masked, tri.output.runbook.actions);
  const executed = planned.map((c) => ({ ...c, result: graph.call(c.name, c.arguments) }));
  const verified = responder.verificationCalls(executed).map((c) => ({ ...c, result: graph.call(c.name, c.arguments) }));
  await ledger.append('response-agent', 'AI_AGENT', 'remediation.executed', 'incident', incident.id, executed.map((c) => c.name).join(','));
  await step('respond', { executed, verified, stage: 4 });

  // 7. COPILOT + CLOSE
  const ctx = { category: tri.output.rootCause.category, confidence: tri.output.rootCause.confidence, priority: risk.priority, runbookId: masked.runbookId, actions: tri.output.runbook.actions, stage: STAGES[5] };
  const closure = copilot.close(ctx);
  await ledger.append('soc-copilot', 'AI_AGENT', 'incident.closed', 'incident', incident.id, closure.output.report.title);
  await step('close', { closure, context: ctx, stage: 5 });

  return { incident, masked, risk, triage: tri, decision, executed, verified, closure, context: ctx, ms: elapsed(), ledger, vault, copilot };
}
