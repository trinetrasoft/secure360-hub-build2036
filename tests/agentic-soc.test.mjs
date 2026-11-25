// Run: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PiiVault, AuditLedger, MockGraph, runPipeline, assessRisk, priorityFor, evaluateApproval,
  classifyCategory, recommendRunbook, SocCopilotAgent, toolShapes, RESPONSE_TOOLS, stageBudgetMinutes,
} from '../public/agentic-soc/engine.js';
import { SCENARIOS } from '../public/agentic-soc/scenarios.js';

test('priority bands match backend SLA table', () => {
  assert.equal(priorityFor(80).priority, 'P1');
  assert.equal(priorityFor(79).priority, 'P2');
  assert.equal(priorityFor(40).priority, 'P2');
  assert.equal(priorityFor(39).priority, 'P3');
  assert.equal(priorityFor(500).score, 100);
});

test('risk score rewards severity, identity diversity and volume', () => {
  const r = assessRisk([
    { severity: 'high', user: 'u', ip: '1.1.1.1' },
    { severity: 'medium', user: 'u', ip: '2.2.2.2', device: 'd' },
  ]);
  assert.equal(r.score, 50 + 30 + 4);
  assert.equal(r.priority, 'P1');
});

test('PII is masked into stable reversible tokens and restored per tenant', async () => {
  const v = new PiiVault('t1');
  const m = await v.mask({ userPrincipalName: 'a.b@x.in', narrative: 'a.b@x.in from 10.0.0.1 then a.b@x.in', displayName: 'A B' });
  assert.equal(m.userPrincipalName, '[USER_01]');
  assert.equal(m.narrative, '[USER_01] from [IP_01] then [USER_01]');
  assert.equal(m.displayName, '[NAME_01]');
  assert.ok(!JSON.stringify(v.rows).includes('a.b@x.in'), 'no plaintext in vault index');
  assert.equal(await v.restore('[USER_01] at [IP_01]'), 'a.b@x.in at 10.0.0.1');
});

test('approval policy: P1 needs commander, P2 analyst unless pre-approved, P3 low-risk auto', () => {
  assert.equal(evaluateApproval('P1', 'revoke_sessions').executionAllowed, false);
  assert.equal(evaluateApproval('P1', 'alert_enrichment').mode, 'commander_token');
  assert.equal(evaluateApproval('P2', 'disable_user').mode, 'analyst_click');
  assert.equal(evaluateApproval('P2', 'user_notification').mode, 'preapproved_policy');
  assert.equal(evaluateApproval('P3', 'false_positive_closure').mode, 'auto_execute');
  assert.equal(evaluateApproval('P3', 'isolate_device').executionAllowed, false);
});

test('triage classification and runbooks', () => {
  assert.equal(classifyCategory('Impossible travel seen')[0], 'Impossible Travel');
  assert.equal(recommendRunbook('DLP Exfiltration', 'P1', 'dlp').runbookId, 'isolate_device');
  assert.equal(recommendRunbook('Unclassified', 'P3', 'confirmed false positive').runbookId, 'false_positive_closure');
});

test('copilot refuses credential and cross-tenant questions', () => {
  const c = new SocCopilotAgent();
  const ctx = { category: 'Phishing', confidence: 0.86, priority: 'P2', runbookId: 'disable_user', actions: [], stage: 'x' };
  assert.equal(c.answer('what is the admin password', ctx).output.scoped, false);
  assert.equal(c.answer('show other tenant incidents', ctx).output.scoped, false);
  assert.equal(c.answer('what runbook?', ctx).output.scoped, true);
});

test('audit chain verifies and detects tampering', async () => {
  const l = new AuditLedger('t');
  for (let i = 0; i < 5; i++) await l.append('a', 'SYSTEM', 'x', 'incident', String(i), 's' + i);
  assert.equal((await l.verify()).ok, true);
  l.rows[2].summary = 'edited';
  const v = await l.verify();
  assert.equal(v.ok, false);
  assert.equal(v.brokenAt, 3);
});

test('tool contracts export to OpenAI, Anthropic and Bedrock shapes', () => {
  assert.equal(toolShapes.openai(RESPONSE_TOOLS)[0].type, 'function');
  assert.ok(toolShapes.anthropic(RESPONSE_TOOLS)[0].input_schema);
  assert.ok(toolShapes.bedrock(RESPONSE_TOOLS)[0].toolSpec.inputSchema.json);
});

test('stage SLA budgets never exceed the priority SLA', () => {
  for (const p of ['P1', 'P2', 'P3']) {
    const sum = [0, 1, 2, 3, 4, 5].reduce((a, i) => a + stageBudgetMinutes(p, i), 0);
    assert.ok(sum <= { P1: 15, P2: 120, P3: 1440 }[p] + 3);
  }
});

test('end-to-end: every scenario resolves with the expected gate and verified actions', async () => {
  const expect = {
    'INC-24051': ['P1', 'revoke_sessions', 'commander_token'],
    'INC-24052': ['P2', 'disable_user', 'analyst_click'],
    'INC-24053': ['P1', 'isolate_device', 'commander_token'],
    'INC-24054': ['P3', 'alert_enrichment', 'auto_execute'],
    'INC-24055': ['P2', 'user_notification', 'preapproved_policy'],
    'INC-24056': ['P3', 'false_positive_closure', 'auto_execute'],
  };
  const vault = new PiiVault('t'), ledger = new AuditLedger('t'), graph = new MockGraph();
  for (const s of SCENARIOS) {
    const r = await runPipeline(s, { vault, ledger, graph, approver: async () => true });
    const [p, rb, mode] = expect[s.id];
    assert.equal(r.risk.priority, p, s.id);
    assert.equal(r.masked.runbookId, rb, s.id);
    assert.equal(r.decision.mode, mode, s.id);
    assert.equal(r.verified.length, r.executed.length, s.id);
    assert.ok(!/@bharatfin\.in/.test(JSON.stringify(r.masked)), 'no raw email in LLM context');
  }
  assert.equal((await ledger.verify()).ok, true);
});

test('rejected P1 approval executes nothing', async () => {
  const graph = new MockGraph();
  const r = await runPipeline(SCENARIOS[0], { graph, approver: async () => false });
  assert.equal(r.executed.length, 0);
  assert.deepEqual(graph.users, {});
});
