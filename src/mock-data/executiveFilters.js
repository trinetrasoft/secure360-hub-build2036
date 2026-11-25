import { REGIONS, DB_TYPES } from './helpers';

export function hasExecutiveFilters(filters) {
  return filters.region !== 'All' || filters.dbType !== 'All';
}

export function regionShare(regionHealth, region) {
  if (region === 'All') return 1;
  const total = regionHealth.reduce((s, r) => s + r.dbs, 0);
  const row = regionHealth.find((r) => r.region === region);
  return row && total > 0 ? row.dbs / total : 1 / REGIONS.length;
}

export function applyExecutiveTotals(baseTotals, regionHealth, filters) {
  if (!hasExecutiveFilters(filters)) return baseTotals;

  const rShare = regionShare(regionHealth, filters.region);
  let inventory = baseTotals.inventory;

  if (filters.dbType !== 'All') {
    inventory = inventory.filter((row) => row.name === filters.dbType);
  }

  inventory = inventory.map((row) => {
    const count = Math.max(1, Math.round(row.count * rShare));
    const critical = Math.max(0, Math.round(row.critical * rShare));
    const warning = Math.max(0, Math.round(row.warning * rShare));
    const healthy = Math.max(0, count - critical - warning);
    return { ...row, count, critical, warning, healthy };
  });

  const totalDbs = inventory.reduce((s, x) => s + x.count, 0);
  const totalCrit = inventory.reduce((s, x) => s + x.critical, 0);
  const totalWarn = inventory.reduce((s, x) => s + x.warning, 0);
  const totalOk = inventory.reduce((s, x) => s + x.healthy, 0);

  return { inventory, totalDbs, totalCrit, totalWarn, totalOk };
}

export function fleetFraction(filteredTotals, baseTotals) {
  if (!baseTotals.totalDbs) return 1;
  return Math.min(1, filteredTotals.totalDbs / baseTotals.totalDbs);
}

export function applyExecutiveMetrics(metrics, fraction) {
  if (fraction >= 0.999) return metrics;
  const f = Math.max(0.04, fraction);
  return {
    ...metrics,
    openIncidents: Math.max(0, Math.round(metrics.openIncidents * f * 1.15)),
    mttr: Math.max(12, Math.round(metrics.mttr * (1.05 - f * 0.25))),
    slaViolations: Math.max(0, Math.round(metrics.slaViolations * f)),
    complianceScore: Math.min(100, Math.max(62, Math.round(metrics.complianceScore + (f - 0.35) * 12))),
    criticalVulns: Math.max(0, Math.round(metrics.criticalVulns * f * 1.1)),
    iamViolations: Math.max(0, Math.round(metrics.iamViolations * f)),
    encryptedPct: Math.min(100, Math.max(60, Math.round(metrics.encryptedPct + (f - 0.4) * 5))),
    auditFindings: Math.max(0, Math.round(metrics.auditFindings * f)),
    policyGaps: Math.max(0, Math.round(metrics.policyGaps * f)),
    monthlySpend: Math.round(metrics.monthlySpend * f),
    computeSpend: Math.round(metrics.computeSpend * f),
    storageSpend: Math.round(metrics.storageSpend * f),
    forecastDelta: +(metrics.forecastDelta * (0.85 + f * 0.3)).toFixed(1),
    aiAutoHealed: Math.max(0, Math.round(metrics.aiAutoHealed * f)),
    aiConfidence: Math.min(99, Math.max(70, Math.round(metrics.aiConfidence + (f - 0.4) * 6))),
    costAvoided: Math.round(metrics.costAvoided * f),
  };
}

export function applyExecutiveStorage(storage, filters) {
  if (!hasExecutiveFilters(filters)) return storage;

  let total = storage.totalTb;
  let used = storage.usedTb;

  if (filters.region !== 'All') {
    const row = storage.byRegion.find((r) => r.region === filters.region);
    if (row) {
      total = row.total;
      used = row.used;
    }
  }

  if (filters.dbType !== 'All') {
    const row = storage.byDbType.find((d) => d.type === filters.dbType);
    if (row) {
      if (filters.region !== 'All') {
        const intersect = Math.min(total / storage.totalTb, row.total / storage.totalTb);
        total = Math.max(8, Math.round(storage.totalTb * intersect));
        used = Math.max(4, Math.round(storage.usedTb * intersect * (row.used / row.total)));
      } else {
        total = row.total;
        used = row.used;
      }
    }
  }

  const availableTb = Math.max(0, total - used);
  const utilizationPct = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;
  const ratio = storage.totalTb > 0 ? total / storage.totalTb : 1;

  let byRegion = storage.byRegion;
  let byDbType = storage.byDbType;
  if (filters.region !== 'All') byRegion = byRegion.filter((r) => r.region === filters.region);
  if (filters.dbType !== 'All') byDbType = byDbType.filter((d) => d.type === filters.dbType);

  const byCategory = storage.byCategory.map((c) => ({
    ...c,
    total: Math.round(c.total * ratio),
    used: Math.round(c.used * ratio),
    available: Math.round(c.available * ratio),
    utilization: c.utilization,
  }));

  const byPlatform = storage.byPlatform.map((p) => ({
    ...p,
    totalTb: Math.max(1, Math.round(p.totalTb * ratio)),
    usedTb: Math.max(1, Math.round(p.usedTb * ratio)),
    freeTb: Math.max(0, Math.round(p.freeTb * ratio)),
    availableTb: Math.max(0, Math.round(p.freeTb * ratio)),
    volumes: p.volumes
      .filter((v) => (filters.region === 'All' || v.region === filters.region))
      .map((v) => ({
        ...v,
        totalTb: Math.max(1, Math.round(v.totalTb * ratio)),
        usedTb: Math.max(1, Math.round(v.usedTb * ratio)),
        freeTb: Math.max(0, Math.round(v.freeTb * ratio)),
      })),
  }));

  const platformTotals = byPlatform.reduce(
    (acc, p) => ({
      totalTb: acc.totalTb + p.totalTb,
      usedTb: acc.usedTb + p.usedTb,
      freeTb: acc.freeTb + p.freeTb,
    }),
    { totalTb: 0, usedTb: 0, freeTb: 0 }
  );

  return {
    ...storage,
    totalTb: total,
    usedTb: used,
    availableTb,
    utilizationPct,
    growthPct30d: +(storage.growthPct30d * (0.7 + ratio * 0.35)).toFixed(1),
    byCategory,
    byRegion,
    byDbType,
    byPlatform,
    platformTotals,
    trend30d: storage.trend30d.map((d) => ({
      ...d,
      used: Math.round(d.used * ratio),
      provisioned: Math.round(d.provisioned * ratio),
    })),
    topConsumers: storage.topConsumers.filter(
      (c) =>
        (filters.region === 'All' || c.region === filters.region) &&
        (filters.dbType === 'All' || c.dbType === filters.dbType)
    ),
  };
}

export function applyExecutiveTrend(trend, fraction) {
  if (fraction >= 0.999) return trend;
  const f = Math.max(0.05, fraction);
  return trend.map((row) => ({
    ...row,
    incidents: Math.max(1, Math.round(row.incidents * f * 1.1)),
    resolved: Math.max(1, Math.round(row.resolved * f)),
    autoHealed: Math.max(0, Math.round(row.autoHealed * f)),
    mttr: Math.max(10, Math.round(row.mttr * (1.1 - f * 0.2))),
  }));
}

export function applyExecutiveCost(costBreakdown, fraction) {
  if (fraction >= 0.999) return costBreakdown;
  const f = Math.max(0.05, fraction);
  return costBreakdown.map((c) => ({ ...c, value: Math.round(c.value * f) }));
}

export function applyExecutiveCspOptimizations(recs, fraction) {
  if (fraction >= 0.999) return recs;
  const f = Math.max(0.05, fraction);
  return recs.map((r) => ({
    ...r,
    monthlySavings: Math.round(r.monthlySavings * f),
    resources: Math.max(1, Math.round(r.resources * f)),
  }));
}

export function applyInstanceProfile(profile, fraction, filters, hosts) {
  if (!hasExecutiveFilters(filters)) return profile;
  const f = Math.max(0.03, fraction);
  let filteredHosts = hosts ?? profile.hosts;
  if (filters.region !== 'All') filteredHosts = filteredHosts.filter((h) => h.region === filters.region);
  if (filters.dbType !== 'All') filteredHosts = filteredHosts.filter((h) => h.dbType === filters.dbType);

  return {
    ...profile,
    hostCount: Math.max(1, Math.round(profile.hostCount * f)),
    dbCount: Math.max(1, Math.round(profile.dbCount * f)),
    usedStorageTb: +(profile.usedStorageTb * f).toFixed(1),
    availableStorageTb: +(profile.availableStorageTb * f).toFixed(1),
    uniqueUsers: Math.max(1, Math.round(profile.uniqueUsers * f)),
    activeSessions: Math.max(1, Math.round(profile.activeSessions * f)),
    privilegedUsers: Math.max(1, Math.round(profile.privilegedUsers * f)),
    avgCpuPct: Math.min(99, Math.round(profile.avgCpuPct * (0.92 + f * 0.12))),
    avgMemPct: Math.min(99, Math.round(profile.avgMemPct * (0.9 + f * 0.14))),
    byRegion: profile.byRegion.filter((r) => filters.region === 'All' || r.region === filters.region),
    hosts: filteredHosts,
    usersByRole: profile.usersByRole.map((r) => ({ ...r, count: Math.max(1, Math.round(r.count * f)) })),
    storageTrend7d: profile.storageTrend7d.map((d) => ({
      ...d,
      used: +(d.used * f).toFixed(1),
      users: Math.max(1, Math.round(d.users * f)),
    })),
  };
}

export function applyInstancesSummary(instances, fraction, filters) {
  if (!hasExecutiveFilters(filters)) return instances;
  const f = Math.max(0.03, fraction);
  return {
    ...instances,
    combined: {
      hostCount: Math.max(1, Math.round(instances.combined.hostCount * f)),
      dbCount: Math.max(1, Math.round(instances.combined.dbCount * f)),
      usedStorageTb: +(instances.combined.usedStorageTb * f).toFixed(1),
      uniqueUsers: Math.max(1, Math.round(instances.combined.uniqueUsers * f)),
      activeSessions: Math.max(1, Math.round(instances.combined.activeSessions * f)),
    },
    comparison: instances.comparison.map((row) => ({
      ...row,
      hosts: Math.max(1, Math.round(row.hosts * f)),
      storage: +(row.storage * f).toFixed(1),
      users: Math.max(1, Math.round(row.users * f)),
      databases: Math.max(1, Math.round(row.databases * f)),
      sessions: Math.max(1, Math.round(row.sessions * f)),
    })),
    storageComparison: instances.storageComparison.map((row) => ({
      ...row,
      used: +(row.used * f).toFixed(1),
      available: +(row.available * f).toFixed(1),
    })),
    userComparison: instances.userComparison.map((row) => ({
      ...row,
      users: Math.max(1, Math.round(row.users * f)),
      sessions: Math.max(1, Math.round(row.sessions * f)),
    })),
  };
}

export function executiveFilterSalt(filters) {
  const ri = filters.region === 'All' ? 0 : REGIONS.indexOf(filters.region) + 1;
  const di = filters.dbType === 'All' ? 0 : DB_TYPES.indexOf(filters.dbType) + 1;
  return ri * 19 + di * 37;
}
