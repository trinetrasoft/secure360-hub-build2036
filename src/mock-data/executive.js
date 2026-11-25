/** Executive dashboard tab metadata and KPI definitions */

export const EXECUTIVE_TABS = [
  'Summary',
  'Threat Ops',
  'Security',
  'Governance',
  'Risk',
  'Data Assets',
  'Assets',
  'AI Security',
];

export const EXECUTIVE_TAB_META = {
  Summary: {
    eyebrow: 'Security Command · Last 24h',
    title: 'Unified posture across',
    highlight: 'protected assets',
  },
  'Threat Ops': {
    eyebrow: 'Threat Operations · SOC view',
    title: 'Detection & response across',
    highlight: 'critical workloads',
  },
  Security: {
    eyebrow: 'Security · Threat & exposure',
    title: 'Risk surface across',
    highlight: 'enterprise assets',
  },
  Governance: {
    eyebrow: 'Governance · Policy & audit',
    title: 'Compliance coverage for',
    highlight: 'regulated environments',
  },
  Risk: {
    eyebrow: 'Risk · Security investment',
    title: 'Security program spend ·',
    highlight: '$1.30M MTD',
  },
  'Data Assets': {
    eyebrow: 'Data governance · Classification',
    title: 'Sensitive data footprint across',
    highlight: 'the estate',
  },
  Assets: {
    eyebrow: 'Asset inventory · Host level',
    title: 'Security assets across',
    highlight: 'cloud & on-prem estate',
  },
  'AI Security': {
    eyebrow: 'AI Security · Model & prompt risk',
    title: 'AI-driven protection across',
    highlight: 'the security program',
  },
};
