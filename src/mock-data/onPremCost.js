import { C } from '../theme/colors';

const ON_PREM_SHARE = {
  'All Environments': 0.38,
  Production: 0.36,
  Staging: 0.2,
  DR: 0.48,
  Development: 0.14,
};

const BASE_ON_PREM_BREAKDOWN = [
  { name: 'SOC & SIEM operations', color: '#64748b' },
  { name: 'Security appliances', color: C.warn },
  { name: 'GRC & audit tooling', color: '#7c3aed' },
  { name: 'Identity platform', color: '#0891b2' },
  { name: 'Facilities & power', color: '#0d9488' },
  { name: 'Security FTE / MSSP', color: C.info },
];

const DATACENTERS = [
  { id: 'dc-use1', name: 'Ashburn SOC-1', region: 'US-East', hosts: 142, dbs: 412 },
  { id: 'dc-usw2', name: 'Portland SOC-2', region: 'US-West', hosts: 98, dbs: 287 },
  { id: 'dc-uk', name: 'Slough Security DC', region: 'UK', hosts: 76, dbs: 198 },
  { id: 'dc-in', name: 'Pune Security DC', region: 'India', hosts: 64, dbs: 176 },
  { id: 'dc-sg', name: 'Singapore DC', region: 'Singapore', hosts: 41, dbs: 112 },
  { id: 'dc-hk', name: 'Hong Kong DC', region: 'Hong Kong', hosts: 28, dbs: 78 },
];

const BASE_WEIGHTS = [0.32, 0.2, 0.18, 0.12, 0.06, 0.12];

export const ON_PREM_OPTIMIZATIONS = [
  {
    id: 'op-siem-01',
    category: 'SIEM',
    title: 'Consolidate on-prem log retention appliances',
    suggestion: 'Tier-1 hot storage exceeds 90-day requirement; move 40% volume to warm tier per SOC playbook.',
    monthlySavings: 14_800,
    priority: 'high',
  },
  {
    id: 'op-edr-02',
    category: 'Endpoint',
    title: 'Reclaim dormant EDR appliance licenses',
    suggestion: 'On-prem management server licenses exceed active agent count by 280 seats.',
    monthlySavings: 9_400,
    priority: 'high',
  },
  {
    id: 'op-grc-03',
    category: 'GRC',
    title: 'Automate evidence collection for ISO audits',
    suggestion: 'Replace manual GRC exports with API collectors; reduce consultant hours by 120h/quarter.',
    monthlySavings: 6_100,
    priority: 'medium',
  },
];

export function getOnPremShare(env = 'All Environments') {
  return ON_PREM_SHARE[env] ?? ON_PREM_SHARE['All Environments'];
}

export function buildOnPremCost(monthlySpendTotal, env = 'All Environments', fleetFrac = 1) {
  const f = Math.max(0.05, fleetFrac);
  const share = getOnPremShare(env);
  const onPremTotal = Math.round(monthlySpendTotal * share * f);
  const cloudTotal = Math.round(monthlySpendTotal * f) - onPremTotal;

  const breakdown = BASE_ON_PREM_BREAKDOWN.map((item, i) => ({
    ...item,
    value: Math.round(onPremTotal * BASE_WEIGHTS[i]),
  }));

  const hostSum = DATACENTERS.reduce((s, d) => s + d.dbs, 0);
  const datacenters = DATACENTERS.map((dc) => ({
    ...dc,
    spend: Math.round(onPremTotal * (dc.dbs / hostSum)),
    pct: (dc.dbs / hostSum) * 100,
  }));

  const optimizations = ON_PREM_OPTIMIZATIONS.map((o) => ({
    ...o,
    monthlySavings: Math.round(o.monthlySavings * f * (env === 'Production' ? 1 : env === 'Development' ? 0.2 : 0.55)),
  }));

  return {
    monthlySpend: onPremTotal,
    cloudSpend: cloudTotal,
    sharePct: share * 100,
    breakdown,
    datacenters,
    optimizations,
    potentialSavings: optimizations.reduce((s, o) => s + o.monthlySavings, 0),
    hostCount: Math.round(DATACENTERS.reduce((s, d) => s + d.hosts, 0) * f),
    dbCount: Math.round(hostSum * f),
    forecastDelta: +(3.2 * (env === 'Staging' ? 1.4 : 1)).toFixed(1),
  };
}
