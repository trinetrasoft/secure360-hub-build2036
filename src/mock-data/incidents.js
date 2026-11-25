import { REGIONS, SECURITY_DOMAINS, ENVS } from './helpers';
import {
  INCIDENT_TYPES,
  INCIDENT_ROOT_CAUSES,
  INCIDENT_RESOLUTIONS,
  INCIDENT_IMPACTS,
  assetName,
  KNOWLEDGE_ARTICLES,
} from './securityData';

const seeded = (i, salt = 0) => {
  const x = Math.sin((i + 1) * 9301 + salt * 49297) * 10000;
  return x - Math.floor(x);
};

const pickAt = (arr, i, salt = 0) => arr[Math.floor(seeded(i, salt) * arr.length)];

const statusForIndex = (i) => {
  const r = Math.floor(seeded(i, 1) * 100);
  if (r < 10) return 'Escalated';
  if (r < 28) return 'Auto-Resolved';
  if (r < 34) return 'Resolved';
  if (r < 48) return 'AI-Resolving';
  if (r < 62) return 'Investigating';
  return 'Active';
};

const severityForIndex = (i) => {
  const r = Math.floor(seeded(i, 2) * 10);
  if (r < 2) return 'P1';
  if (r < 5) return 'P2';
  return 'P3';
};

const generateIncidents = (n) => {
  const list = [];
  for (let i = 0; i < n; i++) {
    const status = statusForIndex(i);
    const severity = severityForIndex(i);
    const domain = pickAt(SECURITY_DOMAINS, i, 3);
    const envSlug = pickAt(['prod', 'stg', 'dr'], i, 4);
    const assignee =
      status === 'AI-Resolving' || seeded(i, 5) > 0.55
        ? 'AI Security Agent'
        : pickAt(['D. Mehta', 'A. Chen', 'R. Patel', 'Unassigned', 'S. Wong'], i, 6);

    list.push({
      id: `INC-${48200 + i}`,
      title: pickAt(INCIDENT_TYPES, i, 7),
      severity,
      status,
      db: assetName(domain, envSlug, Math.floor(seeded(i, 8) * 89) + 1),
      domain,
      region: pickAt(REGIONS, i, 9),
      env: pickAt(ENVS, i, 10),
      assignee,
      mttr: Math.floor(seeded(i, 11) * 236) + 4,
      minsAgo: Math.floor(seeded(i, 12) * 478) + 2,
      aiConfidence: Math.floor(seeded(i, 13) * 35) + 62,
      correlated: Math.floor(seeded(i, 14) * 7),
      aiRecommendation:
        ['Active', 'Investigating', 'AI-Resolving'].includes(status) && seeded(i, 15) > 0.35,
      rootCause: pickAt(INCIDENT_ROOT_CAUSES, i, 16),
      suggestedResolution: pickAt(INCIDENT_RESOLUTIONS, i, 17),
      predictedImpact: pickAt(INCIDENT_IMPACTS, i, 18),
      resolvedAt:
        status === 'Auto-Resolved' || status === 'Resolved'
          ? `${Math.floor(seeded(i, 19) * 48) + 1}m ago`
          : null,
      escalatedTo:
        status === 'Escalated' ? pickAt(['SOC Tier-2', 'CISO Office', 'Legal / Privacy'], i, 20) : null,
    });
  }
  return list.sort((a, b) => a.minsAgo - b.minsAgo);
};

export const INCIDENTS = generateIncidents(34);
export { KNOWLEDGE_ARTICLES };

const trendSeeded = (i, salt) => {
  const x = Math.sin((i + 1) * 7919 + salt * 104729) * 10000;
  return x - Math.floor(x);
};

export const TREND_30D = Array.from({ length: 30 }, (_, i) => ({
  day: `D${i + 1}`,
  incidents: Math.floor(trendSeeded(i, 1) * 46) + 18,
  resolved: Math.floor(trendSeeded(i, 2) * 45) + 15,
  autoHealed: Math.floor(trendSeeded(i, 3) * 30) + 8,
  mttr: Math.floor(trendSeeded(i, 4) * 74) + 18,
}));

export const INCIDENT_TAB_FILTERS = {
  'Active Incidents': (inc) =>
    ['Active', 'Investigating', 'AI-Resolving'].includes(inc.status),
  'AI Recommendations': (inc) =>
    inc.aiRecommendation &&
    ['Active', 'Investigating', 'AI-Resolving'].includes(inc.status),
  'Auto-Resolved': (inc) => ['Auto-Resolved', 'Resolved'].includes(inc.status),
  Escalated: (inc) => inc.status === 'Escalated',
};
