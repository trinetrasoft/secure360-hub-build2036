/** Export helpers for EOL compliance dashboard. */

import { downloadExcelWorkbook, downloadCsv as downloadCsvFile } from './excelExport';

const INSTANCE_HEADERS = [
  'Instance Name',
  'Instance ID',
  'Environment',
  'Application',
  'Business unit',
  'Cloud Provider',
  'Host type',
  'Database Type',
  'Database Version',
  'Database EOL Date',
  'OS Type',
  'OS Version',
  'OS EOL Date',
  'Internal Compliance Status',
  'Compliance Status',
  'Risk Rating',
  'Days Remaining',
  'Owner',
  'Region',
  'Status',
  'Upgrade target',
  'Planned remediation',
];

function instanceRows(instances) {
  return instances.map((i) => [
    i.instanceName,
    i.id,
    i.environment,
    i.application,
    i.businessUnit,
    i.cloudProvider,
    i.hostType,
    i.databaseType,
    i.databaseVersion,
    i.databaseEolDate,
    i.osType,
    i.osVersion,
    i.osEolDate,
    i.internalComplianceStatus,
    i.complianceStatus,
    i.riskRating,
    i.daysRemaining,
    i.owner,
    i.region,
    i.status,
    i.upgradeTargetVersion,
    i.plannedRemediationDate,
  ]);
}

export function buildEolExportSheets({ instances, summary, filters, env, highRiskAssets }) {
  const filterRows = filters
    ? Object.entries(filters).map(([k, v]) => [k, v])
    : [];

  const sheets = [
    {
      name: 'Export Info',
      headers: ['Field', 'Value'],
      rows: [
        ['Product', 'Secure360 Hub'],
        ['View', 'EOL Compliance'],
        ['Environment', env ?? 'All Environments'],
        ['Instance count (export)', instances.length],
        ['Exported at', new Date().toLocaleString()],
        ...filterRows,
      ],
    },
    {
      name: 'Summary KPIs',
      headers: ['Metric', 'Value'],
      rows: summary
        ? [
            ['Total instances', summary.totalInstances],
            ['EOL compliant', summary.eolCompliantInstances],
            ['Non-compliant', summary.nonCompliantInstances],
            ['Critical EOL', summary.criticalEolInstances],
            ['Upcoming EOL (90d)', summary.upcomingEol90Days],
            ['Exempted', summary.exemptedInstances],
            ['Unknown', summary.unknownInstances],
          ]
        : [],
    },
    {
      name: 'Instances',
      headers: INSTANCE_HEADERS,
      rows: instanceRows(instances),
    },
  ];

  if (highRiskAssets?.length) {
    sheets.push({
      name: 'High risk assets',
      headers: INSTANCE_HEADERS,
      rows: instanceRows(highRiskAssets),
    });
  }

  return sheets;
}

export function exportInstancesToCsv(instances, filename = 'eol-compliance-export.csv') {
  if (!instances.length) return;
  downloadCsvFile(INSTANCE_HEADERS, instanceRows(instances), filename);
}

export function exportInstancesToExcel(instances, filename = 'eol-compliance-export.xls', meta = null) {
  if (!instances.length && !meta?.summary) return;

  const sheets = meta
    ? buildEolExportSheets({
        instances,
        summary: meta.summary,
        filters: meta.filters,
        env: meta.env,
        highRiskAssets: meta.highRiskAssets,
      })
    : [
        {
          name: 'Instances',
          headers: INSTANCE_HEADERS,
          rows: instanceRows(instances),
        },
      ];

  downloadExcelWorkbook(sheets, filename);
}

export function exportEolComplianceReport({ instances, summary, filters, env, highRiskAssets }) {
  if (!instances?.length && !summary) return;
  const sheets = buildEolExportSheets({ instances: instances ?? [], summary, filters, env, highRiskAssets });
  downloadExcelWorkbook(
    sheets,
    `enterprise-control-tower-eol-compliance-${(env ?? 'all').replace(/\s/g, '-')}.xls`
  );
}

export function exportInstancesToPdf(instances) {
  const prev = document.title;
  document.title = `EOL Compliance Report (${instances.length} instances)`;
  window.print();
  document.title = prev;
}
