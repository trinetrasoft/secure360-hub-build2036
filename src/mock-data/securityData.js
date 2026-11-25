/**
 * Central security-themed reference data — single source of truth for mock generators.
 * Counts and domains are aligned across inventory, incidents, storage, and policy modules.
 */
import { SECURITY_DOMAINS, REGIONS, ENVS } from './helpers';

export { SECURITY_DOMAINS, REGIONS, ENVS };

/** Per-domain asset counts (sum = 1,548 protected assets). */
export const DOMAIN_ASSET_COUNTS = {
  Cloud: 280,
  Identity: 195,
  Endpoint: 320,
  Network: 210,
  Application: 268,
  Data: 185,
  'AI Systems': 90,
};

export const TOTAL_PROTECTED_ASSETS = Object.values(DOMAIN_ASSET_COUNTS).reduce((s, n) => s + n, 0);

export const DOMAIN_SLUG = {
  Cloud: 'cloud',
  Identity: 'idp',
  Endpoint: 'endpoint',
  Network: 'net',
  Application: 'app',
  Data: 'data',
  'AI Systems': 'llm',
};

export const ENV_SLUG = {
  Production: 'prod',
  Staging: 'stg',
  DR: 'dr',
  Development: 'dev',
};

export function assetName(domain, envOrSlug, index = 1) {
  const slug = typeof envOrSlug === 'string' && envOrSlug.length <= 3
    ? envOrSlug
    : ENV_SLUG[envOrSlug] || 'prod';
  const d = DOMAIN_SLUG[domain] || 'asset';
  return `${d}-${slug}-${String(index).padStart(2, '0')}`;
}

export const INCIDENT_TYPES = [
  'Credential stuffing attack detected',
  'Lateral movement across cloud accounts',
  'Ransomware precursor on endpoint fleet',
  'DLP violation — regulated data egress',
  'Prompt injection against LLM gateway',
  'Privilege escalation via IAM misconfiguration',
  'C2 beaconing from internal subnet',
  'Failed MFA bypass attempt burst',
  'Shadow AI application discovered',
  'WAF rule bypass on payment API',
  'Certificate expiry on critical service',
  'Insider threat — abnormal data access',
  'Supply-chain vulnerability in CI pipeline',
  'Zero-day exploit attempt blocked',
  'Phishing campaign targeting executives',
];

export const INCIDENT_ROOT_CAUSES = [
  'Compromised service account with excessive cloud IAM permissions; activity correlates with geo-anomalous login.',
  'OAuth token replay detected across three regions within 12 minutes; failed MFA on upstream IdP.',
  'EDR flagged ransomware-like encryption pattern; host isolated pending forensic imaging.',
  'CASB detected PCI-tagged objects uploaded to unsanctioned SaaS; no blocking policy on channel.',
  'LLM guardrail score exceeded threshold; session transcripts flagged for prompt-injection patterns.',
  'CSPM identified public S3 bucket with sensitive object ACL; exposure window ~4 hours.',
];

export const INCIDENT_RESOLUTIONS = [
  'Revoke compromised credentials · enforce step-up MFA · rotate keys · Runbook IR-204.',
  'Isolate affected hosts · block IOCs at perimeter · escalate to Tier-2 SOC · Runbook IR-118.',
  'Apply emergency patch ring · quarantine endpoints · notify data owners · Runbook IR-307.',
  'Deploy CASB block rule · open governance exception · preserve audit trail · Runbook IR-091.',
];

export const INCIDENT_IMPACTS = [
  'Potential breach of 42 cloud accounts; estimated regulatory notification risk if uncontained.',
  'Customer PII exposure risk; GDPR 72-hour clock may apply for EU data subjects.',
  'Payment API availability at risk; ~$14K/hr revenue exposure during active exploitation.',
  'Model output could leak RAG corpus secrets; AI governance policy breach.',
];

export const POLICY_CONTROL_TYPES = ['Preventive', 'Detective', 'Corrective', 'Audit'];
export const POLICY_STATUSES = ['COMPLIANT', 'NON_COMPLIANT', 'IN_PROGRESS', 'EXPIRED'];

export const DATA_CLASSIFICATIONS = [
  { name: 'PII / Personal data', color: '#dc2626' },
  { name: 'PHI / Health records', color: '#ea580c' },
  { name: 'PCI / Financial', color: '#d97706' },
  { name: 'Intellectual property', color: '#7c3aed' },
  { name: 'Internal confidential', color: '#2563eb' },
  { name: 'Public / low sensitivity', color: '#059669' },
];

export const DATA_STORE_TYPES = ['Object storage', 'File shares', 'Databases', 'SaaS repositories', 'Backup archives'];

export const SECURITY_INTEGRATIONS_CONNECTED = [
  { id: 'entra', name: 'Microsoft Entra ID', cat: 'Identity', status: 'connected', lastSync: '22s ago', records: 12400, lag: 2 },
  { id: 'azure-monitor', name: 'Azure Monitor', cat: 'Cloud', status: 'connected', lastSync: '31s ago', records: 28124, lag: 3 },
  { id: 'azure-defender', name: 'Microsoft Defender', cat: 'XDR', status: 'connected', lastSync: '44s ago', records: 9754, lag: 4 },
  { id: 'azure-arc', name: 'Azure Arc', cat: 'Hybrid Cloud', status: 'connected', lastSync: '1m ago', records: 1548, lag: 6 },
  { id: 'splunk', name: 'Splunk SIEM', cat: 'SIEM', status: 'connected', lastSync: '19s ago', records: 142839, lag: 2 },
];

export const SECURITY_INTEGRATIONS_AVAILABLE = [
  { id: 'wiz', name: 'Wiz', cat: 'CNAPP', status: 'available', lastSync: '—', records: 0, lag: 0 },
  { id: 'crowd', name: 'CrowdStrike', cat: 'EDR', status: 'available', lastSync: '—', records: 0, lag: 0 },
  { id: 'prisma', name: 'Prisma Cloud', cat: 'CSPM', status: 'available', lastSync: '—', records: 0, lag: 0 },
  { id: 'tenable', name: 'Tenable', cat: 'Vuln Mgmt', status: 'available', lastSync: '—', records: 0, lag: 0 },
  { id: 'servicenow', name: 'ServiceNow', cat: 'ITSM', status: 'available', lastSync: '—', records: 0, lag: 0 },
  { id: 'okta', name: 'Okta', cat: 'Identity', status: 'available', lastSync: '—', records: 0, lag: 0 },
  { id: 'elastic', name: 'Elastic SIEM', cat: 'SIEM', status: 'available', lastSync: '—', records: 0, lag: 0 },
  { id: 'qualys', name: 'Qualys', cat: 'Vuln Mgmt', status: 'available', lastSync: '—', records: 0, lag: 0 },
  { id: 'tanium', name: 'Tanium', cat: 'Endpoint', status: 'available', lastSync: '—', records: 0, lag: 0 },
  { id: 'aws-config', name: 'AWS Config', cat: 'CSPM', status: 'available', lastSync: '—', records: 0, lag: 0 },
  { id: 'palo-cortex', name: 'Cortex XSOAR', cat: 'SOAR', status: 'available', lastSync: '—', records: 0, lag: 0 },
  { id: 'proofpoint', name: 'Proofpoint', cat: 'Email Security', status: 'available', lastSync: '—', records: 0, lag: 0 },
  { id: 'zscaler', name: 'Zscaler', cat: 'SSE', status: 'available', lastSync: '—', records: 0, lag: 0 },
  { id: 'asset-connector', name: 'Asset Connector', cat: 'CMDB', status: 'available', lastSync: '—', records: 0, lag: 0 },
  { id: 'lakera', name: 'Lakera Guard', cat: 'AI Security', status: 'available', lastSync: '—', records: 0, lag: 0 },
  { id: 'nightfall', name: 'Nightfall AI', cat: 'DLP', status: 'available', lastSync: '—', records: 0, lag: 0 },
  { id: 'snow-cmdb', name: 'ServiceNow CMDB', cat: 'CMDB', status: 'available', lastSync: '—', records: 0, lag: 0 },
];

export const EOL_SECURITY_PRODUCTS = ['CrowdStrike Sensor', 'Splunk Enterprise', 'Palo Alto PAN-OS', 'Okta Agent', 'HashiCorp Vault'];

export const KNOWLEDGE_ARTICLES = [
  { id: 'KB-204', title: 'Credential compromise — IAM revocation playbook', category: 'Runbook', tags: ['Identity', 'P1'], updated: '2026-05-10', uses: 142, summary: 'Revoke sessions, rotate keys, enforce MFA, audit CloudTrail/Entra sign-in logs.' },
  { id: 'KB-118', title: 'Ransomware containment on endpoint fleet', category: 'Runbook', tags: ['EDR', 'Endpoint'], updated: '2026-05-08', uses: 89, summary: 'Isolate hosts, preserve forensic image, block IOCs, validate backup integrity.' },
  { id: 'KB-307', title: 'Prompt injection response — LLM gateway', category: 'Playbook', tags: ['AI Security'], updated: '2026-05-12', uses: 201, summary: 'Enable tier-2 guardrails, quarantine sessions, review RAG corpus access.' },
  { id: 'KB-091', title: 'DLP violation — regulated data egress', category: 'Runbook', tags: ['Data Gov', 'GDPR'], updated: '2026-05-01', uses: 67, summary: 'Block channel, notify DPO, document breach assessment timeline.' },
  { id: 'KB-044', title: 'C2 beaconing — network isolation', category: 'Guide', tags: ['Network', 'SOC'], updated: '2026-04-22', uses: 54, summary: 'Firewall deny rules, PCAP capture, threat intel enrichment.' },
  { id: 'KB-156', title: 'Incident severity & escalation matrix', category: 'Policy', tags: ['ITSM', 'Severity'], updated: '2026-03-15', uses: 312, summary: 'P1–P3 definitions, SOC escalation, regulatory notification triggers.' },
];
