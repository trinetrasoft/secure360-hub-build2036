import { C } from '../theme/colors';

export const CSP_META = {
  AWS: { label: 'AWS', color: '#FF9900', bg: '#fff7ed', source: 'Security Hub · Cost Explorer' },
  Azure: { label: 'Azure', color: '#0078D4', bg: '#eff6ff', source: 'Defender · Cost Management' },
  GCP: { label: 'GCP', color: '#4285F4', bg: '#eff6ff', source: 'Security Command Center' },
};

export const CSP_OPTIMIZATIONS = [
  {
    id: 'aws-cspm-01',
    csp: 'AWS',
    category: 'License consolidation',
    title: 'Consolidate overlapping CSPM tools on AWS estate',
    suggestion: 'Prisma and native Security Hub cover 78% duplicate controls. Retire redundant scanner on 420 accounts.',
    monthlySavings: 18_400,
    confidence: 91,
    effort: 'Medium',
    resources: 420,
    priority: 'high',
  },
  {
    id: 'aws-siem-02',
    csp: 'AWS',
    category: 'SIEM tuning',
    title: 'Reduce Splunk ingest via intelligent sampling',
    suggestion: 'High-volume VPC flow logs can sample at 10% without losing detection fidelity per SOC tuning guide.',
    monthlySavings: 12_200,
    confidence: 88,
    effort: 'Low',
    resources: 12,
    priority: 'high',
  },
  {
    id: 'aws-idle-03',
    csp: 'AWS',
    category: 'Unused licenses',
    title: 'Reclaim 340 unused CrowdStrike seats',
    suggestion: 'EDR agents inactive > 90 days on decommissioned instances. Align license count to active asset inventory.',
    monthlySavings: 9_800,
    confidence: 94,
    effort: 'Low',
    resources: 340,
    priority: 'high',
  },
  {
    id: 'az-defender-01',
    csp: 'Azure',
    category: 'Plan rightsizing',
    title: 'Downgrade Defender plans on non-production subscriptions',
    suggestion: 'Staging/DR subscriptions on Plan 2; workload profile supports Plan 1 without coverage gap per Microsoft guidance.',
    monthlySavings: 14_600,
    confidence: 89,
    effort: 'Medium',
    resources: 8,
    priority: 'high',
  },
  {
    id: 'az-sentinel-02',
    csp: 'Azure',
    category: 'Log retention',
    title: 'Optimize Sentinel retention tiers',
    suggestion: 'Move 180-day analytics to basic archive tier; hot tier retains 90 days per regulatory mapping.',
    monthlySavings: 6_200,
    confidence: 86,
    effort: 'Low',
    resources: 4,
    priority: 'medium',
  },
  {
    id: 'gcp-scc-01',
    csp: 'GCP',
    category: 'Control overlap',
    title: 'Disable duplicate vulnerability scanners',
    suggestion: 'SCC Premium and third-party scanner both cover container CVEs. Standardize on single pipeline for GKE fleet.',
    monthlySavings: 7_400,
    confidence: 90,
    effort: 'Medium',
    resources: 64,
    priority: 'medium',
  },
  {
    id: 'gcp-chronicle-02',
    csp: 'GCP',
    category: 'SIEM tuning',
    title: 'Chronicle ingest filter for DNS noise',
    suggestion: 'Filter benign internal DNS patterns identified in 30-day SOC review; preserves threat detection on anomalies.',
    monthlySavings: 4_100,
    confidence: 84,
    effort: 'Low',
    resources: 2,
    priority: 'low',
  },
];

const PRIORITY_TONE = { high: 'crit', medium: 'warn', low: 'neutral' };

export function formatSavings(amount) {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1000)}K`;
  return `$${amount.toLocaleString()}`;
}

export function getCspOptimizationSummary(recs) {
  const monthlySavings = recs.reduce((s, r) => s + r.monthlySavings, 0);
  const byCsp = recs.reduce((acc, r) => {
    acc[r.csp] = (acc[r.csp] || 0) + 1;
    return acc;
  }, {});
  return { monthlySavings, count: recs.length, byCsp };
}

export function groupByCsp(recs) {
  return ['AWS', 'Azure', 'GCP'].map((csp) => ({
    csp,
    meta: CSP_META[csp],
    items: recs.filter((r) => r.csp === csp),
    savings: recs.filter((r) => r.csp === csp).reduce((s, r) => s + r.monthlySavings, 0),
  }));
}

export function priorityTone(priority) {
  return PRIORITY_TONE[priority] || 'neutral';
}

export function categoryColor(category) {
  const map = {
    'License consolidation': C.accent,
    'SIEM tuning': C.info,
    'Unused licenses': C.crit,
    'Plan rightsizing': C.warn,
    'Log retention': '#7c3aed',
    'Control overlap': '#0d9488',
  };
  return map[category] || C.inkMute;
}

const REGIONS = {
  AWS: ['us-east-1', 'us-west-2', 'eu-west-2', 'ap-southeast-1'],
  Azure: ['East US', 'West Europe', 'UK South', 'Southeast Asia'],
  GCP: ['us-central1', 'europe-west2', 'asia-south1'],
};

const CONSOLE_PATHS = {
  AWS: { default: 'Security Hub → Insights → Cost optimization' },
  Azure: { default: 'Microsoft Defender for Cloud → Recommendations' },
  GCP: { default: 'Security Command Center → Findings' },
};

const CONSOLE_URLS = {
  AWS: 'https://console.aws.amazon.com/securityhub/home',
  Azure: 'https://portal.azure.com/#view/Microsoft_Azure_Security',
  GCP: 'https://console.cloud.google.com/security/command-center',
};

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 10000;
  return h;
}

export function getOptimizationDetail(item) {
  const regions = REGIONS[item.csp] || ['global'];
  const seed = hashSeed(item.id);
  const region = regions[seed % regions.length];
  const paths = CONSOLE_PATHS[item.csp] || {};
  const consolePath = paths[item.category] || paths.default || 'Recommendations';

  const count = Math.min(item.resources, 8);
  const affectedResources = Array.from({ length: count }, (_, i) => ({
    id: `${item.id}-r${i}`,
    name: `asset-${(seed + i * 17) % 90000 + 10000}`,
    region: regions[(seed + i) % regions.length],
    current: 'Full license / ingest',
    recommended: 'Optimized tier',
  }));

  return {
    region,
    annualSavings: item.monthlySavings * 12,
    status: item.priority === 'high' ? 'Ready to implement' : 'Under review',
    consoleLabel: `${item.csp} security console`,
    consolePath,
    consoleUrl: CONSOLE_URLS[item.csp],
    affectedResources,
    implementationSteps: [
      'Validate recommendation against security architecture standards.',
      'Obtain CISO approval and document control impact assessment.',
      'Pilot in non-production or limited scope subscription.',
      'Measure detection efficacy and cost delta for 30 days.',
    ],
  };
}
