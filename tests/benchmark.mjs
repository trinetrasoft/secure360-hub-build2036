// Run: node tests/benchmark.mjs [count]
import { PiiVault, AuditLedger, MockGraph, runPipeline } from '../public/agentic-soc/engine.js';
import { SCENARIOS } from '../public/agentic-soc/scenarios.js';

const n = Number(process.argv[2] || 10000);
const v = new PiiVault('bench'), l = new AuditLedger('bench'), g = new MockGraph();
const times = [];
const counts = { P1: 0, P2: 0, P3: 0 };
let leaks = 0, p1Gated = 0, auto = 0;
const t0 = performance.now();
for (let i = 0; i < n; i++) {
  const b = SCENARIOS[i % SCENARIOS.length];
  const upn = b.userPrincipalName.replace('@', `${i}@`);
  const inc = { ...b, id: `${b.id}-${i}`, userPrincipalName: upn, narrative: b.narrative.replaceAll(b.userPrincipalName, upn) };
  const s = performance.now();
  const r = await runPipeline(inc, { vault: v, ledger: l, graph: g, approver: async () => true });
  times.push(performance.now() - s);
  counts[r.risk.priority]++;
  if (r.risk.priority === 'P1' && r.decision.mode === 'commander_token') p1Gated++;
  if (['auto_execute', 'preapproved_policy'].includes(r.decision.mode)) auto++;
  if (/@bharatfin\.in|\b\d{1,3}(\.\d{1,3}){3}\b/.test(JSON.stringify(r.masked))) leaks++;
}
const total = performance.now() - t0;
times.sort((a, b) => a - b);
const pct = (p) => times[Math.min(times.length - 1, Math.floor(p * times.length))].toFixed(3);
const chain = await l.verify();
const out = {
  incidents: n,
  seconds: +(total / 1000).toFixed(2),
  throughput_per_s: Math.round(n / (total / 1000)),
  p50_ms: +pct(0.5), p95_ms: +pct(0.95), p99_ms: +pct(0.99),
  priority_mix: counts,
  auto_resolved_pct: +((auto / n) * 100).toFixed(1),
  p1_routed_to_commander: `${p1Gated}/${counts.P1}`,
  raw_pii_in_llm_context: leaks,
  audit_records: l.rows.length,
  audit_chain_intact: chain.ok,
  vault_tokens: v.rows.length,
  node: process.version,
};
console.log(JSON.stringify(out, null, 2));
