import { downloadExcelWorkbook } from './excelExport';
import { formatSpend } from '../mock-data/envScope';
import { formatStorageTb } from '../mock-data/storage';
import { getEolComplianceData, filterEolInstances, buildEolDerivedView } from '../mock-data/eolCompliance';
import { buildEolExportSheets } from './eolExport';

function contextSheet({ tab, env, filters, instanceHostType }) {
  return {
    name: 'Export Info',
    headers: ['Field', 'Value'],
    rows: [
      ['Product', 'Secure360 Hub'],
      ['View', tab],
      ['Environment', env],
      ['Region filter', filters.region],
      ['Asset domain filter', filters.dbType],
      ['Instance sub-view', instanceHostType ?? '—'],
      ['Exported at', new Date().toLocaleString()],
    ],
  };
}

function kpiSheet(metrics, totals, tab) {
  const rows = [
    ['Total databases', totals.totalDbs],
    ['Healthy', totals.totalOk],
    ['Warning', totals.totalWarn],
    ['Critical issues', totals.totalCrit],
    ['Compliance score', `${metrics.complianceScore}/100`],
    ['Open incidents', metrics.openIncidents],
    ['SLA violations (MTD)', metrics.slaViolations],
    ['MTTR (min)', metrics.mttr],
    ['Monthly spend', formatSpend(metrics.monthlySpend)],
    ['Compute spend', formatSpend(metrics.computeSpend)],
    ['Storage spend', formatSpend(metrics.storageSpend)],
    ['AI auto-healed (30d)', metrics.aiAutoHealed],
    ['AI confidence %', metrics.aiConfidence],
    ['Cost avoided', formatSpend(metrics.costAvoided)],
    ['Critical vulns', metrics.criticalVulns],
    ['IAM violations', metrics.iamViolations],
    ['Encrypted at rest %', metrics.encryptedPct],
    ['Audit findings', metrics.auditFindings],
    ['Policy gaps', metrics.policyGaps],
  ];
  return { name: `${tab} KPIs`, headers: ['Metric', 'Value'], rows };
}

function inventorySheet(totals) {
  return {
    name: 'Database inventory',
    headers: ['Asset domain', 'Total', 'Healthy', 'Warning', 'Critical'],
    rows: totals.inventory.map((r) => [r.name, r.count, r.healthy, r.warning, r.critical]),
  };
}

function regionHealthSheet(rows) {
  return {
    name: 'Regional health',
    headers: ['Region', 'Databases', 'Health %', 'Active incidents', 'Latency ms'],
    rows: rows.map((r) => [r.region, r.dbs, r.health, r.incidents, r.lat]),
  };
}

function trendSheet(trendData) {
  return {
    name: '30-day trend',
    headers: ['Day', 'Incidents raised', 'Resolved', 'AI auto-healed', 'MTTR min'],
    rows: trendData.map((d) => [d.day, d.incidents, d.resolved, d.autoHealed, d.mttr]),
  };
}

function complianceSheet(frameworks) {
  return {
    name: 'Compliance frameworks',
    headers: ['Framework', 'Score', 'Passed', 'Failed', 'Total controls', 'Trend'],
    rows: frameworks.map((f) => [f.framework, f.score, f.passed, f.failed, f.total, f.trend]),
  };
}

function costSheet(costBreakdown, monthlySpend) {
  return {
    name: 'Cost breakdown',
    headers: ['Category', 'Amount USD', 'Share of total'],
    rows: costBreakdown.map((c) => [
      c.name,
      c.value,
      monthlySpend ? `${((c.value / monthlySpend) * 100).toFixed(1)}%` : '—',
    ]),
  };
}

function heatmapSheet(heatmap, regions) {
  const headers = ['Asset domain', ...regions];
  const rows = heatmap.map((row) => [
    row.type,
    ...row.cells.map((c) => c.v),
  ]);
  return { name: 'Risk heatmap', headers, rows };
}

function storageOverviewSheet(storage) {
  return {
    name: 'Storage summary',
    headers: ['Metric', 'Value'],
    rows: [
      ['Total capacity', formatStorageTb(storage.totalTb)],
      ['Used', formatStorageTb(storage.usedTb)],
      ['Available', formatStorageTb(storage.availableTb)],
      ['Utilization %', storage.utilizationPct],
      ['30d growth %', storage.growthPct30d],
      ['IOPS avg', storage.iopsAvg],
      ['Snapshot TB', storage.snapshotTb],
    ],
  };
}

function storageByCategorySheet(storage) {
  return {
    name: 'Storage by category',
    headers: ['Category', 'Total TB', 'Used TB', 'Available TB', 'Utilization %'],
    rows: storage.byCategory.map((c) => [c.name, c.total, c.used, c.available, c.utilization]),
  };
}

function storageByDbSheet(storage) {
  return {
    name: 'Storage by DB type',
    headers: ['Asset domain', 'Total TB', 'Used TB', 'Available TB', 'Utilization %'],
    rows: storage.byDbType.map((d) => [d.type, d.total, d.used, d.available, d.utilization]),
  };
}

function storageByRegionSheet(storage) {
  return {
    name: 'Storage by region',
    headers: ['Region', 'Total TB', 'Used TB', 'Available TB', 'Utilization %'],
    rows: storage.byRegion.map((r) => [r.region, r.total, r.used, r.available, r.utilization]),
  };
}

function storagePlatformsSheet(storage) {
  return {
    name: 'SAN NFS NAS',
    headers: ['Platform', 'Total TB', 'Used TB', 'Free TB', 'Utilization %', 'Arrays'],
    rows: storage.byPlatform.map((p) => [
      p.type,
      p.totalTb,
      p.usedTb,
      p.freeTb,
      p.utilizationPct,
      p.arrays ?? '—',
    ]),
  };
}

function storageVolumesSheet(storage) {
  const rows = [];
  storage.byPlatform.forEach((p) => {
    (p.volumes ?? []).forEach((v) => {
      rows.push([
        p.type,
        v.id,
        v.name,
        v.region,
        v.totalTb,
        v.usedTb,
        v.freeTb,
        v.utilization,
        v.protocol,
      ]);
    });
  });
  return {
    name: 'Storage volumes',
    headers: ['Platform', 'Volume ID', 'Name', 'Region', 'Total TB', 'Used TB', 'Free TB', 'Util %', 'Protocol'],
    rows,
  };
}

function storageConsumersSheet(storage) {
  return {
    name: 'Top consumers',
    headers: ['Database', 'DB type', 'Region', 'Total TB', 'Used TB', 'Utilization %', '7d growth %'],
    rows: (storage.topConsumers ?? []).map((c) => [
      c.db,
      c.dbType,
      c.region,
      c.totalTb,
      c.usedTb,
      c.utilization,
      c.growth7d,
    ]),
  };
}

function instanceHostsSheet(hosts, hostType) {
  return {
    name: `${hostType} hosts`,
    headers: ['Hostname', 'Region', 'Engine', 'Databases', 'Storage used TB', 'Storage total TB', 'Users', 'Sessions', 'CPU %', 'Memory %', 'Status'],
    rows: hosts.map((h) => [
      h.hostname,
      h.region,
      h.dbType,
      h.databases,
      h.storageUsedTb,
      h.storageTotalTb,
      h.users,
      h.activeSessions,
      h.cpuPct,
      h.memPct,
      h.status,
    ]),
  };
}

function instanceRegionalSheet(byRegion, hostType) {
  return {
    name: `${hostType} by region`,
    headers: ['Region', 'Hosts', 'Storage TB', 'Users', 'Databases'],
    rows: byRegion.map((r) => [r.region, r.hosts, r.storageTb, r.users, r.databases]),
  };
}

function aiRecsSheet(recs) {
  return {
    name: 'AI recommendations',
    headers: ['ID', 'Priority', 'Confidence %', 'Title', 'Suggestion', 'Pattern'],
    rows: recs.map((r) => [r.id, r.priority, r.confidence, r.title, r.suggestion, r.pattern]),
  };
}

export function exportExecutiveDashboardExcel(payload) {
  const {
    tab,
    env,
    filters,
    instanceHostType,
    totals,
    metrics,
    trendData,
    regionHealth,
    compliance,
    costBreakdown,
    storage,
    heatmap,
    heatmapRegions,
    instanceProfile,
    aiRecs,
    eolFilters,
  } = payload;

  if (tab === 'Instances' && instanceHostType === 'EOL Compliance') {
    const data = getEolComplianceData(env);
    const appliedFilters = eolFilters ?? {
      cloudProvider: 'All',
      environment: 'All',
      application: 'All',
      databaseType: 'All',
      osType: 'All',
      complianceStatus: 'All',
      riskRating: 'All',
      region: 'All',
    };
    const filtered = filterEolInstances(data.instances, appliedFilters);
    const derived = buildEolDerivedView(filtered);
    const sheets = buildEolExportSheets({
      instances: filtered,
      summary: derived.summary,
      filters: appliedFilters,
      env,
      highRiskAssets: filtered
        .filter((i) => i.riskRating === 'Critical' || i.riskRating === 'High')
        .sort((a, b) => a.daysRemaining - b.daysRemaining)
        .slice(0, 50),
    });
    downloadExcelWorkbook(sheets, `enterprise-control-tower-eol-compliance-${env.replace(/\s/g, '-')}.xls`);
    return;
  }

  const sheets = [contextSheet({ tab, env, filters, instanceHostType }), kpiSheet(metrics, totals, tab)];

  if (['Summary', 'Operations', 'Security', 'Governance', 'Cost', 'AI Insights'].includes(tab)) {
    sheets.push(inventorySheet(totals));
  }

  if (['Summary', 'Operations', 'Cost', 'AI Insights'].includes(tab)) {
    sheets.push(regionHealthSheet(regionHealth));
  }

  if (['Summary', 'Operations', 'AI Insights'].includes(tab) && trendData?.length) {
    sheets.push(trendSheet(trendData));
  }

  if (['Summary', 'Security', 'Governance'].includes(tab)) {
    sheets.push(complianceSheet(compliance));
  }

  if (tab === 'Cost') {
    sheets.push(costSheet(costBreakdown, metrics.monthlySpend));
  }

  if (['Summary', 'Security', 'Operations'].includes(tab) && heatmap?.length) {
    sheets.push(heatmapSheet(heatmap, heatmapRegions));
  }

  if (tab === 'Storage') {
    sheets.push(
      storageOverviewSheet(storage),
      storageByCategorySheet(storage),
      storageByDbSheet(storage),
      storageByRegionSheet(storage),
      storagePlatformsSheet(storage),
      storageVolumesSheet(storage),
      storageConsumersSheet(storage)
    );
  }

  if (tab === 'Instances' && instanceProfile) {
    sheets.push(
      instanceHostsSheet(instanceProfile.hosts, instanceHostType),
      instanceRegionalSheet(instanceProfile.byRegion, instanceHostType)
    );
  }

  if (tab === 'AI Insights' && aiRecs?.length) {
    sheets.push(aiRecsSheet(aiRecs));
  }

  const slug = tab.toLowerCase().replace(/\s+/g, '-');
  downloadExcelWorkbook(sheets, `enterprise-control-tower-executive-${slug}-${env.replace(/\s/g, '-')}.xls`);
}
