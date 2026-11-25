import { downloadExcelWorkbook, downloadCsv } from './excelExport';

const HEADERS = [
  'Asset Name', 'Asset ID', 'Type', 'Vendor', 'Model', 'Serial', 'Firmware',
  'Hardware EOL', 'Support contract end', 'Environment', 'Region', 'Location', 'Datacenter',
  'Compliance', 'Risk', 'Days remaining', 'Owner', 'Status', 'Replacement model',
];

function rows(assets) {
  return assets.map((a) => [
    a.assetName,
    a.id,
    a.assetType,
    a.vendor,
    a.model,
    a.serialNumber,
    a.firmwareVersion,
    a.hardwareEolDate,
    a.supportContractEnd,
    a.environment,
    a.region,
    a.location,
    a.datacenter,
    a.complianceStatus,
    a.riskRating,
    a.daysRemaining,
    a.owner,
    a.status,
    a.replacementModel,
  ]);
}

export function buildHardwareExportSheets({ assets, summary, filters, env }) {
  const filterRows = filters ? Object.entries(filters).map(([k, v]) => [k, v]) : [];
  return [
    {
      name: 'Export Info',
      headers: ['Field', 'Value'],
      rows: [
        ['Product', 'Secure360 Hub'],
        ['View', 'Hardware EOL'],
        ['Environment', env ?? 'All Environments'],
        ['Asset count', assets.length],
        ['Exported at', new Date().toLocaleString()],
        ...filterRows,
      ],
    },
    {
      name: 'Summary KPIs',
      headers: ['Metric', 'Value'],
      rows: summary
        ? [
            ['Total assets', summary.totalAssets],
            ['EOL compliant', summary.eolCompliantAssets],
            ['Non-compliant', summary.nonCompliantAssets],
            ['Critical EOL', summary.criticalEolAssets],
            ['Upcoming EOL (90d)', summary.upcomingEol90Days],
            ['Exempted', summary.exemptedAssets],
          ]
        : [],
    },
    {
      name: 'Hardware assets',
      headers: HEADERS,
      rows: rows(assets),
    },
  ];
}

export function exportHardwareEolReport({ assets, summary, filters, env }) {
  if (!assets?.length && !summary) return;
  downloadExcelWorkbook(
    buildHardwareExportSheets({ assets: assets ?? [], summary, filters, env }),
    `enterprise-control-tower-hardware-eol-${(env ?? 'all').replace(/\s/g, '-')}.xls`
  );
}

export function exportHardwareToCsv(assets, filename = 'hardware-eol-export.csv') {
  if (!assets.length) return;
  downloadCsv(HEADERS, rows(assets), filename);
}
