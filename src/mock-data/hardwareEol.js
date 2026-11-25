import { REGIONS } from './helpers';
import { ALL_ENVS, envSalt } from './envScope';
import { daysUntil } from '../utils/eolRisk';

const seeded = (i, salt = 0) => {
  const x = Math.sin((i + 1) * 5923 + salt * 2711) * 10000;
  return x - Math.floor(x);
};

const pick = (arr, i, salt = 0) => arr[Math.floor(seeded(i, salt) * arr.length)];

export const HW_VENDORS = ['Dell', 'HPE', 'Cisco', 'IBM', 'NetApp', 'Pure Storage', 'Juniper', 'Lenovo'];
export const HW_ASSET_TYPES = ['Server', 'Storage', 'Network', 'Blade Chassis', 'Appliance'];
export const HW_ENVIRONMENTS = ['Production', 'Staging', 'DR', 'Development'];
export const HW_LOCATIONS = ['Data Hall A', 'Data Hall B', 'Edge POP', 'DR Site', 'Lab'];

const MODELS = {
  Server: ['PowerEdge R750', 'ProLiant DL380', 'System x3650', 'ThinkSystem SR650'],
  Storage: ['PowerStore 500T', '3PAR 8450', 'FAS8300', 'FlashArray//X70'],
  Network: ['Nexus 93180', 'Aruba 6300', 'QFX5120', 'EX4400'],
  'Blade Chassis': ['PowerEdge MX7000', 'BladeSystem c7000', 'Flex System'],
  Appliance: ['Data Domain DD6400', 'Avamar AVE', 'Backup Appliance G4'],
};

function addDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function deriveHwRisk(eolDate) {
  const days = daysUntil(eolDate);
  let riskRating = 'Low';
  if (days <= 0) riskRating = 'Critical';
  else if (days <= 30) riskRating = 'Critical';
  else if (days <= 90) riskRating = 'High';
  else if (days <= 180) riskRating = 'Medium';
  return { daysRemaining: days, riskRating };
}

function generateHardwareAssets(count = 120, envFilter = ALL_ENVS) {
  const base = new Date();
  const salt = envSalt(envFilter, 301);
  const list = [];

  for (let i = 0; i < count; i++) {
    const vendor = pick(HW_VENDORS, i, 1);
    const assetType = pick(HW_ASSET_TYPES, i, 2);
    const model = pick(MODELS[assetType], i, 3);
    const environment = envFilter === ALL_ENVS ? pick(HW_ENVIRONMENTS, i, 4) : envFilter;
    const eolOffset = Math.floor((seeded(i, 5) - 0.45) * 500);
    const hardwareEolDate = addDays(base, eolOffset);
    const { daysRemaining, riskRating } = deriveHwRisk(hardwareEolDate);

    const exemptRoll = seeded(i, 6);
    let complianceStatus = 'Compliant';
    if (exemptRoll < 0.05) complianceStatus = 'Exempted';
    else if (daysRemaining <= 0 || daysRemaining <= 90) complianceStatus = 'Non-Compliant';
    else if (daysRemaining <= 180) complianceStatus = 'Non-Compliant';

    const region = pick(REGIONS, i, 7);
    list.push({
      id: `HW-${String(i + 1).padStart(4, '0')}`,
      assetName: `${vendor.toLowerCase().replace(/\s/g, '')}-${assetType.toLowerCase().replace(/\s/g, '')}-${String(i + 1).padStart(3, '0')}`,
      assetType,
      vendor,
      model,
      serialNumber: `SN${String(100000 + i + salt).slice(-8)}`,
      firmwareVersion: `${Math.floor(seeded(i, 8) * 9) + 1}.${Math.floor(seeded(i, 9) * 20)}.${Math.floor(seeded(i, 10) * 99)}`,
      hardwareEolDate,
      supportContractEnd: addDays(base, eolOffset + 90),
      environment,
      region,
      location: pick(HW_LOCATIONS, i, 11),
      datacenter: `${region.split('-')[0]}-DC${(i % 3) + 1}`,
      complianceStatus,
      riskRating,
      daysRemaining,
      owner: pick(['Infra Ops', 'Network Team', 'Storage Team', 'Platform Eng'], i, 12),
      status: riskRating === 'Critical' ? 'Replace scheduled' : riskRating === 'High' ? 'Remediation planned' : 'Monitoring',
      replacementModel: `${model} Gen2`,
      cpuCores: assetType === 'Server' || assetType === 'Blade Chassis' ? Math.floor(seeded(i, 13) * 64) + 16 : null,
      memoryGb: assetType === 'Server' ? Math.floor(seeded(i, 14) * 512) + 64 : null,
      capacityTb: assetType === 'Storage' ? Math.floor(seeded(i, 15) * 800) + 50 : null,
    });
  }
  return list;
}

function computeSummary(assets) {
  const total = assets.length;
  const compliant = assets.filter((a) => a.complianceStatus === 'Compliant').length;
  const nonCompliant = assets.filter((a) => a.complianceStatus === 'Non-Compliant').length;
  const critical = assets.filter((a) => a.riskRating === 'Critical').length;
  const upcoming90 = assets.filter((a) => a.daysRemaining > 0 && a.daysRemaining <= 90).length;
  const exempted = assets.filter((a) => a.complianceStatus === 'Exempted').length;

  return {
    totalAssets: total,
    eolCompliantAssets: compliant,
    nonCompliantAssets: nonCompliant,
    criticalEolAssets: critical,
    upcomingEol90Days: upcoming90,
    exemptedAssets: exempted,
  };
}

function complianceDistribution(assets) {
  const counts = { Compliant: 0, 'Non-Compliant': 0, Exempted: 0 };
  assets.forEach((a) => {
    const key = a.complianceStatus === 'Exempted' ? 'Exempted' : a.complianceStatus === 'Compliant' ? 'Compliant' : 'Non-Compliant';
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}

function complianceByAssetType(assets) {
  const types = [...new Set(assets.map((a) => a.assetType))];
  return types.map((type) => {
    const subset = assets.filter((a) => a.assetType === type);
    const compliant = subset.filter((a) => a.complianceStatus === 'Compliant').length;
    return {
      name: type.length > 14 ? type.slice(0, 13) + '…' : type,
      fullName: type,
      compliant: subset.length ? Math.round((compliant / subset.length) * 100) : 0,
      nonCompliant: subset.length ? Math.round(((subset.length - compliant) / subset.length) * 100) : 0,
    };
  });
}

function complianceByVendor(assets) {
  const vendors = [...new Set(assets.map((a) => a.vendor))];
  return vendors
    .map((vendor) => {
      const subset = assets.filter((a) => a.vendor === vendor);
      const nc = subset.filter((a) => a.complianceStatus === 'Non-Compliant').length;
      return { name: vendor, count: nc };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function eolTrend12Months(assets) {
  const months = [];
  const now = new Date();
  for (let m = 11; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const label = d.toLocaleString('en', { month: 'short', year: '2-digit' });
    const factor = 0.65 + seeded(11 - m, 400) * 0.45;
    months.push({
      month: label,
      upcomingEol: Math.round(assets.length * 0.035 * factor),
      remediated: Math.round(assets.length * 0.02 * factor),
      nonCompliant: Math.round(assets.length * 0.07 * (1.05 - m * 0.025)),
    });
  }
  return months;
}

export function filterHardwareAssets(assets, filters) {
  return assets.filter((row) => {
    if (filters.vendor !== 'All' && row.vendor !== filters.vendor) return false;
    if (filters.assetType !== 'All' && row.assetType !== filters.assetType) return false;
    if (filters.environment !== 'All' && row.environment !== filters.environment) return false;
    if (filters.complianceStatus !== 'All' && row.complianceStatus !== filters.complianceStatus) return false;
    if (filters.riskRating !== 'All' && row.riskRating !== filters.riskRating) return false;
    if (filters.region !== 'All' && row.region !== filters.region) return false;
    if (filters.location !== 'All' && row.location !== filters.location) return false;
    return true;
  });
}

export function buildHardwareDerivedView(assets) {
  const summary = computeSummary(assets);
  return {
    summary,
    compliancePie: complianceDistribution(assets),
    byAssetType: complianceByAssetType(assets),
    byVendor: complianceByVendor(assets),
    trend12m: eolTrend12Months(assets),
    highRiskAssets: assets
      .filter((a) => a.riskRating === 'Critical' || a.riskRating === 'High')
      .sort((a, b) => a.daysRemaining - b.daysRemaining)
      .slice(0, 12),
    aiInsights: [
      assets.filter((a) => a.assetType === 'Server' && a.daysRemaining > 0 && a.daysRemaining <= 60).length > 0 &&
        `${assets.filter((a) => a.assetType === 'Server' && a.daysRemaining > 0 && a.daysRemaining <= 60).length} servers reach hardware EOL within 60 days.`,
      assets.filter((a) => a.vendor === 'Cisco' && a.complianceStatus === 'Non-Compliant').length > 0 &&
        'Cisco network gear accounts for the largest share of hardware non-compliance.',
      assets.filter((a) => a.assetType === 'Storage').length > 0 &&
        'Prioritize storage array firmware upgrades before Q4 capacity expansion.',
      summary.upcomingEol90Days > 0 &&
        `${summary.upcomingEol90Days} hardware assets have EOL within the next 90 days.`,
    ].filter(Boolean),
  };
}

export function getHardwareEolData(env = ALL_ENVS) {
  const assets = generateHardwareAssets(120, env);
  const summary = computeSummary(assets);

  return {
    assets,
    summary,
    ...buildHardwareDerivedView(assets),
    filterOptions: {
      vendors: HW_VENDORS,
      assetTypes: HW_ASSET_TYPES,
      environments: HW_ENVIRONMENTS,
      locations: HW_LOCATIONS,
      complianceStatuses: ['Compliant', 'Non-Compliant', 'Exempted'],
      riskRatings: ['Critical', 'High', 'Medium', 'Low'],
      regions: [...new Set(assets.map((a) => a.region))].sort(),
    },
  };
}
