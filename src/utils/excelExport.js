/** Multi-sheet Excel download via HTML SpreadsheetML (opens in Excel, no extra deps). */

function escapeCell(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeSheetName(name) {
  return String(name ?? 'Sheet')
    .replace(/[\\/*?:[\]]/g, '')
    .slice(0, 31) || 'Sheet';
}

function tableHtml(headers, rows) {
  const headerRow = `<tr>${headers.map((h) => `<th>${escapeCell(h)}</th>`).join('')}</tr>`;
  const bodyRows = rows
    .map((row) => `<tr>${row.map((c) => `<td>${escapeCell(c)}</td>`).join('')}</tr>`)
    .join('');
  return `<table border="1" cellspacing="0" cellpadding="4">${headerRow}${bodyRows}</table>`;
}

/**
 * @param {Array<{ name: string, headers: string[], rows: unknown[][] }>} sheets
 * @param {string} filename
 */
export function downloadExcelWorkbook(sheets, filename = 'export.xls') {
  if (!sheets?.length) return;

  const worksheetXml = sheets
    .map(
      (s) => `
    <x:ExcelWorksheet>
      <x:Name>${escapeSheetName(s.name)}</x:Name>
      <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
    </x:ExcelWorksheet>`
    )
    .join('');

  const bodyTables = sheets
    .map((s) => `<div><h3>${escapeCell(s.name)}</h3>${tableHtml(s.headers, s.rows)}</div>`)
    .join('<br/>');

  const html = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8"/>
<!--[if gte mso 9]><xml>
<x:ExcelWorkbook>
<x:ExcelWorksheets>${worksheetXml}
</x:ExcelWorksheets>
</x:ExcelWorkbook>
</xml><![endif]-->
</head>
<body>${bodyTables}</body>
</html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xls') || filename.endsWith('.xlsx') ? filename : `${filename}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadCsv(headers, rows, filename = 'export.csv') {
  const escapeCsv = (value) => {
    const s = String(value ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
