import { rand, randInt, REGIONS } from './helpers';
import { C } from '../theme/colors';

/** AI security & SOC recommendations from the AI engine. */
export const AI_RECS = [
  {
    id: 'AI-9821', priority: 'P1', confidence: 94,
    title: 'Lateral movement detected — identity token replay across cloud workloads',
    rootCause: 'Anomalous OAuth refresh pattern from 3 regions in 12 min. Correlates with failed MFA on svc-api-prod.',
    suggestion: 'Revoke session tokens for affected principals. Enforce step-up MFA on privileged roles.',
    impact: 'Blocks estimated breach path; reduces blast radius across 42 cloud accounts',
    related: ['INC-48231', 'INC-48217', 'INC-48204'],
    pattern: 'MITRE T1078 · Recurring (8 occurrences/30d)',
  },
  {
    id: 'AI-9820', priority: 'P2', confidence: 88,
    title: 'Prompt-injection attempt against production LLM gateway',
    rootCause: 'Guardrail bypass score 0.82 on customer-support-bot. Source IP geo-anomaly vs baseline.',
    suggestion: 'Enable output filtering tier-2. Quarantine session transcripts for forensic review.',
    impact: 'Prevents data exfil via model; protects PII in RAG corpus',
    related: ['INC-48198'],
    pattern: 'AI Security · Predicted (anomaly detection)',
  },
  {
    id: 'AI-9819', priority: 'P2', confidence: 91,
    title: 'Critical CVE cluster on endpoint fleet — patch window overdue',
    rootCause: '14 hosts missing KB5034441. Exploit activity in threat intel feed for same CVE chain.',
    suggestion: 'Trigger emergency patch ring-1. Isolate hosts with active EDR alerts until remediated.',
    impact: 'Closes RCE vector; aligns with CIS Control 7.4',
    related: ['INC-48189', 'INC-48156'],
    pattern: 'Vulnerability forecast',
  },
  {
    id: 'AI-9818', priority: 'P3', confidence: 76,
    title: 'DLP policy gap — sensitive data egress to unsanctioned SaaS',
    rootCause: 'Finance labels detected in uploads to unapproved storage. No blocking rule on channel.',
    suggestion: 'Deploy CASB block rule. Notify data owners; open governance exception workflow.',
    impact: 'Stops regulated data leakage; satisfies GDPR Art. 32 controls',
    related: [],
    pattern: 'Data governance regression',
  },
];

const perfSeeded = (i, salt = 0) => {
  const x = Math.sin((i + 1) * 4409 + salt * 2017) * 10000;
  return x - Math.floor(x);
};

/** 24-hour threat & telemetry metrics (default / summary). */
export const PERF_24H = Array.from({ length: 24 }, (_, i) => ({
  h: `${i.toString().padStart(2, '0')}:00`,
  alerts: Math.round(perfSeeded(i, 1) * 120 + 40),
  events: Math.round(perfSeeded(i, 2) * 8400 + 2200),
  blocked: Math.round(perfSeeded(i, 3) * 340 + 80),
  mttd: Math.round(perfSeeded(i, 4) * 18 + 4),
}));

const DOMAIN_PERF_SALT = {
  Cloud: 11,
  Identity: 23,
  Endpoint: 37,
  Network: 41,
  Application: 53,
  Data: 67,
  'AI Systems': 79,
};

export function getPerfForDbType(domain, envSalt = 0) {
  const salt = (DOMAIN_PERF_SALT[domain] ?? 1) + envSalt;
  return Array.from({ length: 24 }, (_, i) => ({
    h: `${i.toString().padStart(2, '0')}:00`,
    alerts: Math.round(perfSeeded(i, salt) * 120 + 40),
    events: Math.round(perfSeeded(i, salt + 1) * 8400 + 2200),
    blocked: Math.round(perfSeeded(i, salt + 2) * 340 + 80),
    mttd: Math.round(perfSeeded(i, salt + 3) * 18 + 4),
  }));
}

const DOMAIN_EVENT_MATCH = {
  Cloud: 'cloud',
  Identity: 'idp',
  Endpoint: 'endpoint',
  Network: 'net',
  Application: 'app',
  Data: 'data',
  'AI Systems': 'llm',
};

export const SLOW_QUERIES = [
  { hash: 'a7f3...c91', db: 'cloud-prod-04',  exec: 142, avgMs: 8420,  p99: 14201, plan: 'PRIV ESCALATION',   user: 'svc-deploy' },
  { hash: 'd2e8...b14', db: 'idp-prod-12',      exec: 87,  avgMs: 6210,  p99: 11842, plan: 'BRUTE FORCE',        user: 'auth_svc' },
  { hash: '9c1a...f08', db: 'net-prod-02',      exec: 234, avgMs: 4820,  p99: 9210,  plan: 'C2 BEACON',          user: 'fw_egress' },
  { hash: '4b7d...e22', db: 'app-prod-18',      exec: 412, avgMs: 3240,  p99: 7891,  plan: 'SQL INJECTION',      user: 'web_gateway' },
  { hash: 'f1a9...c47', db: 'data-prod-07',     exec: 56,  avgMs: 12420, p99: 19821, plan: 'DLP VIOLATION',      user: 'etl_batch' },
  { hash: '6e2c...a18', db: 'endpoint-prod-05', exec: 198, avgMs: 2810,  p99: 5240,  plan: 'MALWARE EXEC',       user: 'edr_agent' },
  { hash: '8a3f...d02', db: 'llm-prod-07',      exec: 64,  avgMs: 3920,  p99: 7100,  plan: 'PROMPT INJECTION',   user: 'ai_gateway' },
  { hash: '2c9b...e55', db: 'cloud-prod-02',    exec: 31,  avgMs: 5640,  p99: 9800,  plan: 'IAM MISCONFIG',      user: 'cspm_scan' },
];

export function getSlowQueriesForDbType(domain, envFilter = null) {
  const token = DOMAIN_EVENT_MATCH[domain];
  let pool = SLOW_QUERIES;
  if (token) {
    const byType = SLOW_QUERIES.filter((q) => q.db.toLowerCase().includes(token));
    pool = byType.length > 0 ? byType : SLOW_QUERIES.slice(0, 3);
  }
  if (envFilter?.slug) {
    const byEnv = pool.filter((q) => q.db.toLowerCase().includes(`-${envFilter.slug}-`));
    if (byEnv.length > 0) return byEnv;
  }
  return pool;
}

const OPS_METRICS_BY_TYPE = {
  Cloud: [
    { l: 'Critical misconfigs', v: '52', delta: '+8', critical: false },
    { l: 'Public exposure', v: '4', delta: '+1', critical: true },
    { l: 'IAM policy drift', v: '18', delta: '+3', critical: true },
    { l: 'Failed CSPM scans (24h)', v: '2', delta: '0', critical: false },
    { l: 'Over-privileged roles', v: '91', delta: '+4', critical: true },
    { l: 'Secrets in repos', v: '3', delta: '+1', critical: true },
  ],
  Identity: [
    { l: 'Failed logins (1h)', v: '384', delta: '+52', critical: true },
    { l: 'MFA bypass attempts', v: '12', delta: '+4', critical: true },
    { l: 'Stale privileged accounts', v: '28', delta: '−2', critical: false },
    { l: 'Policy violations (24h)', v: '7', delta: '+2', critical: true },
    { l: 'Session anomalies', v: '45', delta: '+9', critical: true },
    { l: 'Orphaned service accounts', v: '6', delta: '+1', critical: false },
  ],
  Endpoint: [
    { l: 'EDR alerts (live)', v: '29', delta: '+3', critical: false },
    { l: 'Unpatched critical CVEs', v: '14', delta: '+6', critical: true },
    { l: 'Ransomware indicators', v: '0', delta: '0', critical: false },
    { l: 'Quarantined hosts (24h)', v: '3', delta: '+2', critical: true },
    { l: 'Disk encryption gaps', v: '8%', delta: '+1%', critical: true },
    { l: 'Local admin sprawl', v: '22', delta: '+3', critical: false },
  ],
  Network: [
    { l: 'IDS signatures fired', v: '41', delta: '+6', critical: false },
    { l: 'East-west anomalies', v: '9', delta: '+2', critical: true },
    { l: 'Firewall rule drift', v: '34', delta: '+5', critical: true },
    { l: 'DNS tunneling suspects', v: '2', delta: '+1', critical: true },
    { l: 'TLS inspection gaps', v: '12%', delta: '↑', critical: true },
    { l: 'Blocked egress (24h)', v: '1.2K', delta: '+180', critical: false },
  ],
  Application: [
    { l: 'WAF blocks (live)', v: '64', delta: '+14', critical: true },
    { l: 'OWASP Top 10 hits', v: '18', delta: '+4', critical: true },
    { l: 'API abuse attempts', v: '210', delta: '+42', critical: true },
    { l: 'Secrets rotation overdue', v: '11', delta: '+2', critical: true },
    { l: 'SAST critical findings', v: '7', delta: '−1', critical: false },
    { l: 'Supply-chain alerts', v: '3', delta: '+1', critical: true },
  ],
  Data: [
    { l: 'DLP incidents (live)', v: '22', delta: '+4', critical: false },
    { l: 'Unclassified stores', v: '5', delta: '+2', critical: true },
    { l: 'Retention violations', v: '8', delta: '+1', critical: false },
    { l: 'Encryption gaps', v: '4', delta: '+1', critical: true },
    { l: 'Cross-border transfers', v: '34', delta: '+8', critical: true },
    { l: 'Access review overdue', v: '142', delta: '+12', critical: true },
  ],
  'AI Systems': [
    { l: 'Prompt injection attempts', v: '47', delta: '+12', critical: true },
    { l: 'Model drift alerts', v: '3', delta: '+1', critical: false },
    { l: 'PII in training corpus', v: '2', delta: '+1', critical: true },
    { l: 'Guardrail bypass rate', v: '0.8%', delta: '+0.3%', critical: true },
    { l: 'Shadow AI apps detected', v: '9', delta: '+3', critical: true },
    { l: 'Output policy violations', v: '18', delta: '+5', critical: true },
  ],
};

export function getOpsMetricsForDbType(domain, envSalt = 0) {
  const base = OPS_METRICS_BY_TYPE[domain] ?? OPS_METRICS_BY_TYPE.Cloud;
  if (!envSalt) return base;
  return base.map((m, i) => {
    const bump = Math.floor((Math.sin((i + 1) * 4409 + envSalt * 2017) * 10000) % 5);
    const v = m.v.replace(/[^\d.]/g, '');
    if (v && !Number.isNaN(Number(v))) {
      const n = Math.max(0, Math.round(Number(v) * (1 + bump * 0.04)));
      return { ...m, v: m.v.includes('%') ? `${n}%` : String(n) };
    }
    return m;
  });
}

/** Security program spend breakdown for executive dashboard. */
export const COST_BREAKDOWN = [
  { name: 'SIEM & SOC',     value: 482000, color: C.accent },
  { name: 'Identity',       value: 287000, color: '#2563eb' },
  { name: 'Cloud Security', value: 124000, color: C.warn },
  { name: 'GRC Tools',      value: 318000, color: '#7c3aed' },
  { name: 'AI Security',    value: 89000,  color: '#0891b2' },
];

const REGION_LATENCY = {
  'US-East': 14, 'US-West': 18, UK: 22, India: 38, Singapore: 31, 'Hong Kong': 29, Australia: 42,
};

export const REGION_HEALTH = REGIONS.map((r) => ({
  region: r,
  dbs: randInt(140, 320), // asset count per region
  health: Math.round(rand(72, 98)),
  incidents: randInt(0, 14),
  lat: REGION_LATENCY[r] || 25,
}));
