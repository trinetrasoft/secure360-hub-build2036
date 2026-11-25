import { REGIONS } from './helpers';
import { ALL_ENVS, envSalt } from './envScope';
import { daysUntil, classifyRisk, deriveInstanceRisk } from '../utils/eolRisk';

const seeded = (i, salt = 0) => {
  const x = Math.sin((i + 1) * 8843 + salt * 2911) * 10000;
  return x - Math.floor(x);
};

const pick = (arr, i, salt = 0) => arr[Math.floor(seeded(i, salt) * arr.length)];

export const EOL_CLOUD_PROVIDERS = ['AWS', 'Azure', 'GCP', 'On-Prem'];
export const EOL_ENVIRONMENTS = ['Production', 'Staging', 'DR', 'Development'];
export const EOL_DB_TYPES = ['CrowdStrike Sensor', 'Splunk Enterprise', 'Palo Alto PAN-OS', 'Okta Agent', 'HashiCorp Vault'];
export const EOL_OS_TYPES = ['RHEL', 'Ubuntu', 'Windows Server', 'Amazon Linux'];

const APPLICATIONS = [
  'Core Banking', 'Payments Hub', 'Trade Settlement', 'Customer Portal', 'Risk Analytics',
  'Data Warehouse', 'Fraud Detection', 'Claims Processing', 'Inventory Mgmt', 'HR Platform',
  'Regulatory Reporting', 'Mobile Banking', 'Loan Origination', 'Treasury', 'CRM Suite',
];

const BUSINESS_UNITS = [
  'Retail Banking', 'Corporate Banking', 'Technology', 'Risk & Compliance', 'Operations',
  'Wealth Management', 'Insurance', 'Digital Channels', 'Infrastructure', 'Data Office',
];

const DB_CATALOG = {
  'CrowdStrike Sensor': [
    { version: '6.x', eolOffset: -120, upgrade: '7.2' },
    { version: '7.0', eolOffset: 180, upgrade: '7.2' },
    { version: '7.1', eolOffset: 420, upgrade: '7.2' },
    { version: '7.2', eolOffset: 900, upgrade: '8.0' },
  ],
  'Splunk Enterprise': [
    { version: '8.2', eolOffset: -200, upgrade: '9.2' },
    { version: '9.0', eolOffset: 60, upgrade: '9.2' },
    { version: '9.1', eolOffset: 280, upgrade: '9.2' },
    { version: '9.2', eolOffset: 740, upgrade: '9.3' },
  ],
  'Palo Alto PAN-OS': [
    { version: '9.1', eolOffset: -90, upgrade: '11.1' },
    { version: '10.2', eolOffset: 90, upgrade: '11.1' },
    { version: '11.0', eolOffset: 340, upgrade: '11.1' },
    { version: '11.1', eolOffset: 800, upgrade: '11.2' },
  ],
  'Okta Agent': [
    { version: '3.8', eolOffset: -60, upgrade: '4.2' },
    { version: '4.0', eolOffset: 120, upgrade: '4.2' },
    { version: '4.1', eolOffset: 380, upgrade: '4.2' },
    { version: '4.2', eolOffset: 720, upgrade: '4.3' },
  ],
  'HashiCorp Vault': [
    { version: '1.12', eolOffset: -180, upgrade: '1.16' },
    { version: '1.14', eolOffset: 45, upgrade: '1.16' },
    { version: '1.15', eolOffset: 210, upgrade: '1.16' },
    { version: '1.16', eolOffset: 680, upgrade: '1.17' },
  ],
};

const OS_CATALOG = {
  RHEL: [
    { version: '7.9', eolOffset: -250, upgrade: '9.4' },
    { version: '8.8', eolOffset: 120, upgrade: '9.4' },
    { version: '9.4', eolOffset: 900, upgrade: '10' },
  ],
  Ubuntu: [
    { version: '18.04 LTS', eolOffset: -300, upgrade: '22.04 LTS' },
    { version: '20.04 LTS', eolOffset: 60, upgrade: '24.04 LTS' },
    { version: '22.04 LTS', eolOffset: 520, upgrade: '24.04 LTS' },
  ],
  'Windows Server': [
    { version: '2012 R2', eolOffset: -500, upgrade: '2022' },
    { version: '2016', eolOffset: -80, upgrade: '2022' },
    { version: '2019', eolOffset: 290, upgrade: '2022' },
    { version: '2022', eolOffset: 880, upgrade: '2025' },
  ],
  'Amazon Linux': [
    { version: '2', eolOffset: 40, upgrade: '2023' },
    { version: '2023', eolOffset: 650, upgrade: '2025' },
  ],
};

function addDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildFindings(dbType, dbVer, osType, osVer, internal) {
  const findings = [];
  if (daysUntil(addDays(new Date(), -30)) < 0 || dbVer.includes('11') || dbVer.includes('2012')) {
    findings.push(`${dbType} ${dbVer} is past vendor security support window.`);
  }
  if (internal === 'Non-Compliant') findings.push('Internal CIS security baseline not met (encryption & logging controls).');
  if (osType === 'Windows Server' && osVer.includes('2016')) findings.push('OS 2016 extended support requires paid ESU program.');
  if (findings.length === 0) findings.push('No open compliance findings. Next review in 30 days.');
  return findings;
}

function generateInstances(count = 200, envFilter = ALL_ENVS) {
  const base = new Date();
  const salt = envSalt(envFilter, 200);
  const list = [];

  for (let i = 0; i < count; i++) {
    const cloud = pick(EOL_CLOUD_PROVIDERS, i, 1);
    const environment =
      envFilter === ALL_ENVS ? pick(EOL_ENVIRONMENTS, i, 2) : envFilter;
    const dbType = pick(EOL_DB_TYPES, i, 3);
    const osType = pick(EOL_OS_TYPES, i, 4);
    const dbEntry = pick(DB_CATALOG[dbType], i, 5);
    const osEntry = pick(OS_CATALOG[osType], i, 6);
    const dbEolJitter = Math.floor((seeded(i, 7) - 0.5) * 40);
    const osEolJitter = Math.floor((seeded(i, 8) - 0.5) * 40);

    const databaseEolDate = addDays(base, dbEntry.eolOffset + dbEolJitter);
    const osEolDate = addDays(base, osEntry.eolOffset + osEolJitter);

    const exemptRoll = seeded(i, 9);
    let internalComplianceStatus = 'Compliant';
    if (exemptRoll < 0.06) internalComplianceStatus = 'Exempted';
    else if (exemptRoll < 0.12) internalComplianceStatus = 'Unknown';
    else if (exemptRoll < 0.38) internalComplianceStatus = 'Non-Compliant';

    const { daysRemaining, riskRating, dbDaysRemaining, osDaysRemaining } = deriveInstanceRisk({
      databaseEolDate,
      osEolDate,
    });

    const dbCompliant = dbDaysRemaining > 180 && internalComplianceStatus === 'Compliant';
    const osCompliant = osDaysRemaining > 180;
    const overallStatus =
      internalComplianceStatus === 'Exempted'
        ? 'Exempted'
        : dbCompliant && osCompliant && internalComplianceStatus === 'Compliant'
          ? 'Compliant'
          : 'Non-Compliant';

    const envSlug = environment.toLowerCase().slice(0, 4);
    const instance = {
      id: `EOL-${String(i + 1).padStart(4, '0')}`,
      instanceName: `${dbType.toLowerCase().replace(/\s/g, '')}-${envSlug}-${cloud.toLowerCase()}-${String(i + 1).padStart(3, '0')}`,
      environment,
      application: pick(APPLICATIONS, i, 10),
      businessUnit: pick(BUSINESS_UNITS, i, 11),
      cloudProvider: cloud,
      databaseType: dbType,
      databaseVersion: dbEntry.version,
      databaseEolDate,
      osType,
      osVersion: osEntry.version,
      osEolDate,
      internalComplianceStatus,
      complianceStatus: overallStatus,
      riskRating,
      daysRemaining,
      owner: pick(['D. Mehta', 'A. Chen', 'R. Patel', 'S. Wong', 'K. Liu', 'J. Brooks'], i, 12),
      region: pick(REGIONS, i, 13),
      status: riskRating === 'Critical' ? 'Action Required' : riskRating === 'High' ? 'Remediation Planned' : 'Monitoring',
      hostType: seeded(i, 14) > 0.35 ? 'VMs' : 'Bare Metal',
      upgradeTargetVersion: `${dbEntry.upgrade} / ${osEntry.upgrade}`,
      plannedRemediationDate: addDays(base, Math.max(14, daysRemaining - 45)),
      remediationActions: [
        `Upgrade ${dbType} from ${dbEntry.version} to ${dbEntry.upgrade}.`,
        `Patch ${osType} to ${osEntry.upgrade} during next maintenance window.`,
        'Validate application compatibility in staging prior to production cutover.',
      ],
      infrastructure: {
        vcpu: Math.floor(seeded(i, 15) * 32) + 4,
        memoryGb: Math.floor(seeded(i, 16) * 256) + 16,
        storageTb: +(seeded(i, 17) * 12 + 0.5).toFixed(1),
        availabilityZone: `${pick(REGIONS, i, 18).split('-')[0]}-az${(i % 3) + 1}`,
        cluster: `${cloud}-${environment}-cluster-${(i % 8) + 1}`,
      },
      complianceFindings: buildFindings(dbType, dbEntry.version, osType, osEntry.version, internalComplianceStatus),
      dbEolCompliant: dbDaysRemaining > 180,
      osEolCompliant: osDaysRemaining > 180,
      internalCompliant: internalComplianceStatus === 'Compliant',
    };
    list.push(instance);
  }
  return list;
}

function computeSummary(instances) {
  const total = instances.length;
  const compliant = instances.filter((i) => i.complianceStatus === 'Compliant').length;
  const nonCompliant = instances.filter((i) => i.complianceStatus === 'Non-Compliant').length;
  const critical = instances.filter((i) => i.riskRating === 'Critical').length;
  const upcoming90 = instances.filter((i) => i.daysRemaining > 0 && i.daysRemaining <= 90).length;
  const exempted = instances.filter((i) => i.complianceStatus === 'Exempted').length;
  const unknown = instances.filter((i) => i.internalComplianceStatus === 'Unknown').length;

  return {
    totalInstances: total,
    eolCompliantInstances: compliant,
    nonCompliantInstances: nonCompliant,
    criticalEolInstances: critical,
    upcomingEol90Days: upcoming90,
    exemptedInstances: exempted,
    unknownInstances: unknown,
  };
}

function complianceDistribution(instances) {
  const counts = { Compliant: 0, 'Non-Compliant': 0, Exempted: 0, Unknown: 0 };
  instances.forEach((i) => {
    const key = i.complianceStatus === 'Exempted' ? 'Exempted' : i.complianceStatus === 'Compliant' ? 'Compliant' : i.complianceStatus === 'Unknown' || i.internalComplianceStatus === 'Unknown' ? 'Unknown' : 'Non-Compliant';
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}

function barComplianceByCategory(instances, field, compliantFn) {
  const types = [...new Set(instances.map((i) => i[field]))];
  return types.map((type) => {
    const subset = instances.filter((i) => i[field] === type);
    const compliant = subset.filter(compliantFn).length;
    return {
      name: type.length > 12 ? type.slice(0, 11) + '…' : type,
      fullName: type,
      compliant: Math.round((compliant / subset.length) * 100),
      nonCompliant: Math.round(((subset.length - compliant) / subset.length) * 100),
    };
  });
}

function eolTrend12Months(instances) {
  const months = [];
  const now = new Date();
  for (let m = 11; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const label = d.toLocaleString('en', { month: 'short', year: '2-digit' });
    const factor = 0.7 + seeded(11 - m, 300) * 0.5;
    months.push({
      month: label,
      upcomingEol: Math.round(instances.length * 0.04 * factor),
      remediated: Math.round(instances.length * 0.025 * factor),
      nonCompliant: Math.round(instances.length * 0.08 * (1.1 - m * 0.03)),
    });
  }
  return months;
}

function topApplications(instances, n = 10) {
  const map = {};
  instances.forEach((i) => {
    if (i.riskRating === 'Critical' || i.riskRating === 'High') {
      map[i.application] = (map[i.application] || 0) + 1;
    }
  });
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, riskCount]) => ({ name, riskCount }));
}

function topBusinessUnits(instances, n = 10) {
  const map = {};
  instances.forEach((i) => {
    if (i.complianceStatus === 'Non-Compliant') {
      map[i.businessUnit] = (map[i.businessUnit] || 0) + 1;
    }
  });
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));
}

function complianceByEnvironment(instances) {
  return EOL_ENVIRONMENTS.map((env) => {
    const subset = instances.filter((i) => i.environment === env);
    const compliant = subset.filter((i) => i.complianceStatus === 'Compliant').length;
    return {
      environment: env,
      pct: subset.length ? Math.round((compliant / subset.length) * 100) : 0,
      total: subset.length,
    };
  }).filter((e) => e.total > 0);
}

function generateAiInsights(instances, summary) {
  const crowdstrike60 = instances.filter(
    (i) => i.databaseType === 'CrowdStrike Sensor' && i.daysRemaining > 0 && i.daysRemaining <= 60
  ).length;
  const prodNc = instances.filter(
    (i) => i.environment === 'Production' && i.complianceStatus === 'Non-Compliant'
  ).length;
  const win2016 = instances.filter(
    (i) => i.osType === 'Windows Server' && i.osVersion.includes('2016')
  ).length;
  const splunk82 = instances.filter(
    (i) => i.databaseType === 'Splunk Enterprise' && i.databaseVersion === '8.2'
  ).length;
  const winPct = summary.totalInstances
    ? Math.round((win2016 / summary.totalInstances) * 100)
    : 0;

  return [
    crowdstrike60 > 0 && `${crowdstrike60} CrowdStrike agents will reach EOL within 60 days.`,
    prodNc > 0 && 'Production environment has the highest non-compliance risk.',
    win2016 > 0 && `Windows Server 2016 contributes ${winPct}% of EOL findings.`,
    splunk82 > 0 && 'Upgrade Splunk 8.2 to 9.2 to maintain vendor security support.',
    summary.upcomingEol90Days > 0 && `${summary.upcomingEol90Days} security assets have EOL within the next 90 days.`,
    summary.criticalEolInstances > 0 && `${summary.criticalEolInstances} assets require immediate remediation (Critical).`,
  ].filter(Boolean);
}

export const FUTURE_CONNECTORS = [
  'AWS Systems Manager', 'AWS Config', 'Azure Arc', 'Azure Resource Graph',
  'GCP Asset Inventory', 'ServiceNow CMDB', 'SCCM', 'Qualys', 'CrowdStrike', 'Tanium',
];

export function buildEolDerivedView(instances) {
  const summary = computeSummary(instances);
  return {
    summary,
    compliancePie: complianceDistribution(instances),
    dbEolBar: barComplianceByCategory(instances, 'databaseType', (i) => i.dbEolCompliant),
    osEolBar: barComplianceByCategory(instances, 'osType', (i) => i.osEolCompliant),
    internalBar: barComplianceByCategory(instances, 'databaseType', (i) => i.internalCompliant),
    trend12m: eolTrend12Months(instances),
    topApplications: topApplications(instances),
    topBusinessUnits: topBusinessUnits(instances),
    complianceByEnv: complianceByEnvironment(instances),
    highRiskAssets: instances
      .filter((i) => i.riskRating === 'Critical' || i.riskRating === 'High')
      .sort((a, b) => a.daysRemaining - b.daysRemaining)
      .slice(0, 12),
    aiInsights: generateAiInsights(instances, summary),
  };
}

export function getEolComplianceData(env = ALL_ENVS) {
  const instances = generateInstances(200, env);

  return {
    instances,
    ...buildEolDerivedView(instances),
    filterOptions: {
      cloudProviders: EOL_CLOUD_PROVIDERS,
      environments: EOL_ENVIRONMENTS,
      applications: [...new Set(instances.map((i) => i.application))].sort(),
      databaseTypes: EOL_DB_TYPES,
      osTypes: EOL_OS_TYPES,
      complianceStatuses: ['Compliant', 'Non-Compliant', 'Exempted', 'Unknown'],
      riskRatings: ['Critical', 'High', 'Medium', 'Low'],
      regions: [...new Set(instances.map((i) => i.region))].sort(),
    },
  };
}

function matchesComplianceFilter(row, status) {
  if (status === 'Unknown') return row.internalComplianceStatus === 'Unknown';
  return row.complianceStatus === status;
}

export function filterEolInstances(instances, filters) {
  return instances.filter((row) => {
    if (filters.cloudProvider !== 'All' && row.cloudProvider !== filters.cloudProvider) return false;
    if (filters.environment !== 'All' && row.environment !== filters.environment) return false;
    if (filters.application !== 'All' && row.application !== filters.application) return false;
    if (filters.databaseType !== 'All' && row.databaseType !== filters.databaseType) return false;
    if (filters.osType !== 'All' && row.osType !== filters.osType) return false;
    if (filters.complianceStatus !== 'All' && !matchesComplianceFilter(row, filters.complianceStatus)) return false;
    if (filters.riskRating !== 'All' && row.riskRating !== filters.riskRating) return false;
    if (filters.region !== 'All' && row.region !== filters.region) return false;
    return true;
  });
}
