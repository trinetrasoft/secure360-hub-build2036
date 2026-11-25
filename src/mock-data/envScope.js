import { REGIONS } from './helpers';
import { INVENTORY as BASE_INVENTORY } from './inventory';
import { INCIDENTS as ALL_INCIDENTS, TREND_30D as BASE_TREND } from './incidents';
import { COST_BREAKDOWN as BASE_COST, REGION_HEALTH as BASE_REGION, AI_RECS } from './operations';
import { CSP_OPTIMIZATIONS } from './costOptimization';
import { BACKUP_JOBS as ALL_BACKUP_JOBS, BACKUP_TREND as BASE_BACKUP_TREND } from './backup';
export const ALL_ENVS = 'All Environments';

const ENV_SCALE = {
  [ALL_ENVS]: 1,
  Production: 0.72,
  Staging: 0.14,
  DR: 0.08,
  Development: 0.06,
};

const ENV_SLUG = {
  Production: 'prod',
  Staging: 'stg',
  DR: 'dr',
  Development: 'dev',
};

const ENV_INDEX = {
  [ALL_ENVS]: 0,
  Production: 1,
  Staging: 2,
  DR: 3,
  Development: 4,
};

const seeded = (i, salt = 0) => {
  const x = Math.sin((i + 1) * 9301 + salt * 49297) * 10000;
  return x - Math.floor(x);
};

export function envIndex(env = ALL_ENVS) {
  return ENV_INDEX[env] ?? 0;
}

export function envSalt(env, extra = 0) {
  return envIndex(env) * 31 + extra;
}

export function matchesEnv(recordEnv, selectedEnv) {
  if (!selectedEnv || selectedEnv === ALL_ENVS) return true;
  return recordEnv === selectedEnv;
}

export function filterByEnv(items, selectedEnv, envKey = 'env') {
  if (!selectedEnv || selectedEnv === ALL_ENVS) return items;
  return items.filter((item) => item[envKey] === selectedEnv);
}

export function getInventoryForEnv(env = ALL_ENVS) {
  if (env === ALL_ENVS) return BASE_INVENTORY;
  const scale = ENV_SCALE[env] ?? 1;
  const salt = envSalt(env);
  return BASE_INVENTORY.map((row, i) => {
    const jitter = 0.88 + seeded(i, salt) * 0.24;
    const count = Math.max(1, Math.round(row.count * scale * jitter));
    const critMult = env === 'Production' ? 1.15 : env === 'Development' ? 0.45 : 0.85;
    const critical = Math.min(count, Math.max(0, Math.round(row.critical * scale * critMult)));
    const warning = Math.min(count - critical, Math.max(0, Math.round(row.warning * scale)));
    const healthy = Math.max(0, count - critical - warning);
    return { ...row, count, critical, warning, healthy };
  });
}

export function getTotalsForEnv(env = ALL_ENVS) {
  const inventory = getInventoryForEnv(env);
  const totalDbs = inventory.reduce((s, x) => s + x.count, 0);
  const totalCrit = inventory.reduce((s, x) => s + x.critical, 0);
  const totalWarn = inventory.reduce((s, x) => s + x.warning, 0);
  const totalOk = inventory.reduce((s, x) => s + x.healthy, 0);
  return { inventory, totalDbs, totalCrit, totalWarn, totalOk };
}

/** Headline KPIs that shift per environment. */
export function getEnvMetrics(env = ALL_ENVS) {
  const presets = {
    [ALL_ENVS]: {
      openIncidents: 34,
      mttr: 42,
      slaViolations: 3,
      complianceScore: 89,
      criticalVulns: 14,
      iamViolations: 38,
      encryptedPct: 94,
      auditFindings: 27,
      policyGaps: 11,
      monthlySpend: 1_300_000,
      computeSpend: 482_000,
      storageSpend: 287_000,
      forecastDelta: 4.1,
      aiAutoHealed: 284,
      aiConfidence: 87,
      costAvoided: 142_000,
    },
    Production: {
      openIncidents: 24,
      mttr: 38,
      slaViolations: 2,
      complianceScore: 91,
      criticalVulns: 9,
      iamViolations: 22,
      encryptedPct: 97,
      auditFindings: 14,
      policyGaps: 4,
      monthlySpend: 936_000,
      computeSpend: 347_000,
      storageSpend: 206_000,
      forecastDelta: 3.2,
      aiAutoHealed: 198,
      aiConfidence: 89,
      costAvoided: 118_000,
    },
    Staging: {
      openIncidents: 6,
      mttr: 54,
      slaViolations: 0,
      complianceScore: 84,
      criticalVulns: 3,
      iamViolations: 9,
      encryptedPct: 88,
      auditFindings: 8,
      policyGaps: 5,
      monthlySpend: 182_000,
      computeSpend: 68_000,
      storageSpend: 41_000,
      forecastDelta: 6.8,
      aiAutoHealed: 42,
      aiConfidence: 81,
      costAvoided: 18_000,
    },
    DR: {
      openIncidents: 3,
      mttr: 48,
      slaViolations: 1,
      complianceScore: 87,
      criticalVulns: 2,
      iamViolations: 5,
      encryptedPct: 96,
      auditFindings: 4,
      policyGaps: 2,
      monthlySpend: 104_000,
      computeSpend: 38_000,
      storageSpend: 29_000,
      forecastDelta: 1.4,
      aiAutoHealed: 28,
      aiConfidence: 85,
      costAvoided: 4_200,
    },
    Development: {
      openIncidents: 1,
      mttr: 61,
      slaViolations: 0,
      complianceScore: 76,
      criticalVulns: 0,
      iamViolations: 2,
      encryptedPct: 72,
      auditFindings: 1,
      policyGaps: 0,
      monthlySpend: 78_000,
      computeSpend: 29_000,
      storageSpend: 11_000,
      forecastDelta: 12.4,
      aiAutoHealed: 16,
      aiConfidence: 74,
      costAvoided: 1_800,
    },
  };
  return presets[env] ?? presets[ALL_ENVS];
}

export function formatSpend(amount) {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1000)}K`;
  return `$${amount}`;
}

export function getIncidentsForEnv(env = ALL_ENVS) {
  return filterByEnv(ALL_INCIDENTS, env);
}

export function getTrendForEnv(env = ALL_ENVS, extraSalt = 0) {
  const salt = envSalt(env, extraSalt);
  const mult =
    env === 'Production' ? 1.05 : env === 'Staging' ? 0.42 : env === 'DR' ? 0.28 : env === 'Development' ? 0.18 : 1;
  return BASE_TREND.map((row, i) => ({
    ...row,
    incidents: Math.max(2, Math.round(row.incidents * mult * (0.9 + seeded(i, salt) * 0.2))),
    resolved: Math.max(2, Math.round(row.resolved * mult * (0.9 + seeded(i, salt + 1) * 0.2))),
    autoHealed: Math.max(1, Math.round(row.autoHealed * mult * (0.85 + seeded(i, salt + 2) * 0.25))),
    mttr: Math.max(12, Math.round(row.mttr * (env === 'Development' ? 1.35 : env === 'DR' ? 1.12 : 1))),
  }));
}

export function getRegionHealthForEnv(env = ALL_ENVS) {
  const salt = envSalt(env, 5);
  const scale = ENV_SCALE[env] ?? 1;
  return BASE_REGION.map((r, i) => {
    const dbs =
      env === ALL_ENVS
        ? r.dbs
        : Math.max(8, Math.round(r.dbs * scale * (0.82 + seeded(i, salt) * 0.36)));
    const health = Math.min(
      99,
      Math.max(
        68,
        Math.round(
          r.health +
            (env === 'Production' ? 2 : env === 'Development' ? -8 : env === 'Staging' ? -3 : 0) +
            (seeded(i, salt + 1) - 0.5) * 6
        )
      )
    );
    const incidents =
      env === ALL_ENVS
        ? r.incidents
        : Math.max(0, Math.round(r.incidents * scale * (env === 'Production' ? 1.3 : 0.5)));
    return { ...r, dbs, health, incidents };
  });
}

export function getCostBreakdownForEnv(env = ALL_ENVS) {
  const m = getEnvMetrics(env);
  const total = m.monthlySpend;
  const baseSum = BASE_COST.reduce((s, c) => s + c.value, 0);
  return BASE_COST.map((c) => ({
    ...c,
    value: Math.round((c.value / baseSum) * total),
  }));
}

export function getAiRecsForEnv(env = ALL_ENVS) {
  if (env === ALL_ENVS) return AI_RECS;
  const slug = ENV_SLUG[env];
  const tagged = AI_RECS.filter((r) => r.title.toLowerCase().includes(slug) || r.related.some((id) => id));
  if (tagged.length >= 2) return tagged;
  const count = env === 'Production' ? 4 : env === 'Staging' ? 3 : 2;
  return AI_RECS.slice(0, count);
}

export function getCspOptimizationsForEnv(env = ALL_ENVS) {
  const scale =
    env === ALL_ENVS ? 1 : env === 'Production' ? 0.82 : env === 'Staging' ? 0.28 : env === 'DR' ? 0.18 : 0.12;
  const count =
    env === ALL_ENVS ? CSP_OPTIMIZATIONS.length : env === 'Production' ? 11 : env === 'Staging' ? 6 : 4;
  return CSP_OPTIMIZATIONS.slice(0, count).map((r) => ({
    ...r,
    monthlySavings: Math.round(r.monthlySavings * scale),
    resources: Math.max(1, Math.round(r.resources * scale)),
  }));
}

export function getBackupJobsForEnv(env = ALL_ENVS) {
  return filterByEnv(ALL_BACKUP_JOBS, env);
}

export function getBackupTrendForEnv(env = ALL_ENVS) {
  const salt = envSalt(env, 8);
  const mult =
    env === 'Production' ? 1 : env === 'Staging' ? 0.35 : env === 'DR' ? 0.22 : env === 'Development' ? 0.15 : 1;
  return BASE_BACKUP_TREND.map((row, i) => ({
    ...row,
    success: Math.round(row.success * mult * (0.92 + seeded(i, salt) * 0.16)),
    failed: Math.max(0, Math.round(row.failed * mult * (env === 'Production' ? 1.1 : 0.6))),
  }));
}

export function getBackupStatsForEnv(env = ALL_ENVS) {
  const jobs = getBackupJobsForEnv(env);
  const success = jobs.filter((j) => j.status === 'SUCCESS').length;
  const failed = jobs.filter((j) => j.status === 'FAILED').length;
  const running = jobs.filter((j) => j.status === 'RUNNING').length;
  const missed = jobs.filter((j) => j.status === 'MISSED').length;
  const lags = jobs.filter((j) => j.lag_mins != null).map((j) => j.lag_mins);
  const avgLag = lags.length ? lags.reduce((a, b) => a + b, 0) / lags.length : 0;
  const rtoMet = jobs.filter((j) => j.rto_met).length;
  const rpoMet = jobs.filter((j) => j.rpo_met).length;
  const total = jobs.length || 1;

  const presets = {
    [ALL_ENVS]: { totalJobs: 1547, success24h: 1489, failed24h: 58, rtoPct: 94.3, rpoPct: 91.7 },
    Production: { totalJobs: 1114, success24h: 1078, failed24h: 36, rtoPct: 96.1, rpoPct: 93.4 },
    Staging: { totalJobs: 216, success24h: 204, failed24h: 12, rtoPct: 91.2, rpoPct: 88.5 },
    DR: { totalJobs: 124, success24h: 118, failed24h: 6, rtoPct: 97.8, rpoPct: 95.2 },
    Development: { totalJobs: 93, success24h: 89, failed24h: 4, rtoPct: 88.4, rpoPct: 84.1 },
  };
  const p = presets[env] ?? presets[ALL_ENVS];

  return {
    jobs,
    totalJobs: env === ALL_ENVS ? p.totalJobs : jobs.length,
    success24h: env === ALL_ENVS ? p.success24h : success + running,
    failed24h: env === ALL_ENVS ? p.failed24h : failed + missed,
    avgLagMins: +(env === ALL_ENVS ? 4.2 : avgLag).toFixed(1),
    rtoPct: env === ALL_ENVS ? p.rtoPct : +((rtoMet / total) * 100).toFixed(1),
    rpoPct: env === ALL_ENVS ? p.rpoPct : +((rpoMet / total) * 100).toFixed(1),
    rtoTrend: env === 'DR' ? 2.4 : env === 'Development' ? -1.2 : 1.2,
    rpoTrend: env === 'Staging' ? -2.1 : -0.8,
  };
}

export function getEnvSlug(env) {
  return ENV_SLUG[env] ?? null;
}

export function dbNameMatchesEnv(dbName, env) {
  if (env === ALL_ENVS) return true;
  const slug = ENV_SLUG[env];
  return slug ? dbName.toLowerCase().includes(`-${slug}-`) || dbName.toLowerCase().startsWith(`${slug}-`) : true;
}

export function getComplianceForEnv(env = ALL_ENVS, frameworks) {
  if (env === ALL_ENVS) return frameworks;
  const delta =
    env === 'Production' ? 2 : env === 'Staging' ? -4 : env === 'DR' ? 1 : env === 'Development' ? -9 : 0;
  return frameworks.map((f, i) => {
    const score = Math.min(100, Math.max(62, f.score + delta + Math.round((seeded(i, envSalt(env)) - 0.5) * 4)));
    const failed = Math.max(0, Math.round(f.failed * (env === 'Production' ? 0.85 : 1.15)));
    const passed = Math.min(f.total, f.total - failed);
    return { ...f, score, failed, passed, trend: f.trend + (delta > 0 ? 0.4 : -0.3) };
  });
}

export function getIntegrationsSummary(env = ALL_ENVS) {
  const connectedBase = 17;
  const scales = {
    [ALL_ENVS]: { connected: 17, lag: '1.2s', records: '2.4M' },
    Production: { connected: 17, lag: '0.8s', records: '1.8M' },
    Staging: { connected: 14, lag: '2.4s', records: '340K' },
    DR: { connected: 12, lag: '3.1s', records: '180K' },
    Development: { connected: 9, lag: '4.8s', records: '42K' },
  };
  return scales[env] ?? scales[ALL_ENVS];
}
