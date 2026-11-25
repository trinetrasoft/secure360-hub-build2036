import { rand, randInt } from './helpers';
import { C } from '../theme/colors';

export const COMPLIANCE = [
  { framework: 'CIS Benchmark', score: 87, total: 412, passed: 358, failed: 54, trend: +2.1 },
  { framework: 'ISO 27001',     score: 91, total: 318, passed: 289, failed: 29, trend: +0.8 },
  { framework: 'PCI-DSS',       score: 84, total: 256, passed: 215, failed: 41, trend: -1.4 },
  { framework: 'SOX',           score: 93, total: 198, passed: 184, failed: 14, trend: +1.2 },
  { framework: 'GDPR',          score: 88, total: 174, passed: 153, failed: 21, trend: +0.4 },
  { framework: 'HIPAA',         score: 90, total: 142, passed: 128, failed: 14, trend: +0.9 },
];

const trendSeed = (i, salt) => {
  const x = Math.sin((i + 1) * 5507 + salt * 3001) * 10000;
  return x - Math.floor(x);
};

export const COMPLIANCE_TREND = Array.from({ length: 12 }, (_, i) => ({
  m: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May'][i],
  cis: Math.round(trendSeed(i, 1) * 13 + 78),
  iso: Math.round(trendSeed(i, 2) * 11 + 82),
  pci: Math.round(trendSeed(i, 3) * 12 + 76),
  sox: Math.round(trendSeed(i, 4) * 9 + 85),
  gdpr: Math.round(trendSeed(i, 5) * 10 + 80),
  hipaa: Math.round(trendSeed(i, 6) * 9 + 83),
}));

/** Maps Security dashboard tab label → trend dataKey */
export const FRAMEWORK_TAB_MAP = {
  CIS: { framework: 'CIS Benchmark', trendKey: 'cis' },
  'ISO 27001': { framework: 'ISO 27001', trendKey: 'iso' },
  'PCI-DSS': { framework: 'PCI-DSS', trendKey: 'pci' },
  SOX: { framework: 'SOX', trendKey: 'sox' },
  GDPR: { framework: 'GDPR', trendKey: 'gdpr' },
  HIPAA: { framework: 'HIPAA', trendKey: 'hipaa' },
};

export const VULN_BY_FRAMEWORK = {
  CIS: [
    { severity: 'Critical', count: 5, color: '#dc2626' },
    { severity: 'High', count: 18, color: '#ea580c' },
    { severity: 'Medium', count: 42, color: '#d97706' },
    { severity: 'Low', count: 61, color: '#65a30d' },
    { severity: 'Info', count: 28, color: '#2563eb' },
  ],
  'ISO 27001': [
    { severity: 'Critical', count: 2, color: '#dc2626' },
    { severity: 'High', count: 9, color: '#ea580c' },
    { severity: 'Medium', count: 24, color: '#d97706' },
    { severity: 'Low', count: 38, color: '#65a30d' },
    { severity: 'Info', count: 15, color: '#2563eb' },
  ],
  'PCI-DSS': [
    { severity: 'Critical', count: 8, color: '#dc2626' },
    { severity: 'High', count: 22, color: '#ea580c' },
    { severity: 'Medium', count: 51, color: '#d97706' },
    { severity: 'Low', count: 44, color: '#65a30d' },
    { severity: 'Info', count: 19, color: '#2563eb' },
  ],
  SOX: [
    { severity: 'Critical', count: 1, color: '#dc2626' },
    { severity: 'High', count: 6, color: '#ea580c' },
    { severity: 'Medium', count: 18, color: '#d97706' },
    { severity: 'Low', count: 29, color: '#65a30d' },
    { severity: 'Info', count: 11, color: '#2563eb' },
  ],
  GDPR: [
    { severity: 'Critical', count: 3, color: '#dc2626' },
    { severity: 'High', count: 11, color: '#ea580c' },
    { severity: 'Medium', count: 28, color: '#d97706' },
    { severity: 'Low', count: 35, color: '#65a30d' },
    { severity: 'Info', count: 14, color: '#2563eb' },
  ],
  HIPAA: [
    { severity: 'Critical', count: 4, color: '#dc2626' },
    { severity: 'High', count: 14, color: '#ea580c' },
    { severity: 'Medium', count: 31, color: '#d97706' },
    { severity: 'Low', count: 40, color: '#65a30d' },
    { severity: 'Info', count: 12, color: '#2563eb' },
  ],
};

export const FAILED_CONTROLS_SAMPLE = {
  CIS: ['CIS 1.1.1 — Inventory of authorized devices', 'CIS 3.4 — Unencrypted data in transit', 'CIS 6.2 — Audit log retention < 90 days'],
  'ISO 27001': ['A.8.2 — Privileged access review overdue', 'A.12.4 — Logging not centralized on 3 hosts'],
  'PCI-DSS': ['Req 3.4 — PAN stored unencrypted (2 DBs)', 'Req 10.2 — Audit trail gaps on payment cluster'],
  SOX: ['SOX ITGC-04 — Segregation of duties exception', 'SOX ITGC-11 — Change ticket missing approval'],
  GDPR: ['Art. 32 — Encryption at rest not enabled (EU shard)', 'Art. 30 — Processing record incomplete'],
  HIPAA: ['§164.312(a) — Access control on clinical DB', '§164.308 — Risk assessment > 12 months old'],
};

export const VULN = [
  { severity: 'Critical', count: 14,  color: C.crit },
  { severity: 'High',     count: 47,  color: '#ea580c' },
  { severity: 'Medium',   count: 132, color: C.warn },
  { severity: 'Low',      count: 218, color: '#65a30d' },
  { severity: 'Info',     count: 89,  color: C.info },
];
