import React, { useState, useEffect, useMemo } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
  CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  ShieldCheck, AlertTriangle, Clock, Server, Download, FileSpreadsheet,
  HardDrive, Moon, Sun, Sparkles, X,
} from 'lucide-react';
import Panel from '../ui/Panel';
import Pill from '../ui/Pill';
import Kpi from '../ui/Kpi';
import SectionHead from '../ui/SectionHead';
import { C } from '../../theme/colors';
import { fetchHardwareEolDashboard } from '../../services/hardwareEolApi';
import { filterHardwareAssets, buildHardwareDerivedView } from '../../mock-data/hardwareEol';
import { riskTone, riskColor, complianceTone } from '../../utils/eolRisk';
import { exportHardwareEolReport, exportHardwareToCsv } from '../../utils/hardwareEolExport';

const PIE_COLORS = {
  Compliant: C.ok,
  'Non-Compliant': C.crit,
  Exempted: C.info,
};

const DARK_THEME = {
  bg: '#0f172a',
  panel: '#1e293b',
  panelAlt: '#334155',
  border: '#475569',
  ink: '#f1f5f9',
  inkSoft: '#cbd5e1',
  inkMute: '#94a3b8',
};

const DEFAULT_FILTERS = {
  vendor: 'All',
  assetType: 'All',
  environment: 'All',
  complianceStatus: 'All',
  riskRating: 'All',
  region: 'All',
  location: 'All',
};

function FilterSelect({ label, value, onChange, options, themeColors }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: themeColors.inkMute }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="azure-select text-[11px] px-2.5 py-2"
        style={{
          color: themeColors.ink,
        }}
      >
        <option value="All">All</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function AssetModal({ asset, onClose, themeColors }) {
  if (!asset) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.55)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-thin rounded shadow-xl"
        style={{ background: themeColors.panel, border: `1px solid ${themeColors.border}` }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: themeColors.border }}>
          <div>
            <div className="font-display font-semibold text-lg" style={{ color: themeColors.ink }}>{asset.assetName}</div>
            <div className="text-xs mt-0.5" style={{ color: themeColors.inkSoft }}>
              {asset.id} · {asset.vendor} {asset.model}
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5" style={{ color: themeColors.inkMute }} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 grid grid-cols-2 gap-3 text-xs">
          {[
            ['Asset type', asset.assetType],
            ['Serial', asset.serialNumber],
            ['Firmware', asset.firmwareVersion],
            ['Hardware EOL', asset.hardwareEolDate],
            ['Support ends', asset.supportContractEnd],
            ['Environment', asset.environment],
            ['Region', asset.region],
            ['Location', asset.location],
            ['Datacenter', asset.datacenter],
            ['Risk', asset.riskRating],
            ['Days remaining', asset.daysRemaining],
            ['Replacement', asset.replacementModel],
            ['Owner', asset.owner],
            ['Status', asset.status],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-[9px] uppercase tracking-wider" style={{ color: themeColors.inkMute }}>{k}</div>
              <div className="font-medium mt-0.5" style={{ color: themeColors.ink }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HardwareEolDashboard({ env }) {
  const [theme, setTheme] = useState('light');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selected, setSelected] = useState(null);

  const themeColors = theme === 'dark' ? { ...C, ...DARK_THEME } : C;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFilters(DEFAULT_FILTERS);
    fetchHardwareEolDashboard(env).then((payload) => {
      if (!cancelled) {
        setData(payload);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [env]);

  const filtered = useMemo(
    () => (data ? filterHardwareAssets(data.assets, filters) : []),
    [data, filters]
  );

  const derived = useMemo(
    () => (filtered.length ? buildHardwareDerivedView(filtered) : null),
    [filtered]
  );

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const clearFilters = () => setFilters(DEFAULT_FILTERS);
  const activeFilterCount = Object.values(filters).filter((v) => v !== 'All').length;

  if (loading || !data) {
    return (
      <Panel className="col-span-12">
        <div className="py-16 text-center text-sm" style={{ color: C.inkMute }}>Loading hardware EOL data…</div>
      </Panel>
    );
  }

  const summary = derived?.summary ?? {
    totalAssets: 0,
    eolCompliantAssets: 0,
    nonCompliantAssets: 0,
    criticalEolAssets: 0,
    upcomingEol90Days: 0,
    exemptedAssets: 0,
  };
  const view = derived ?? {
    compliancePie: [],
    byAssetType: [],
    byVendor: [],
    trend12m: [],
    highRiskAssets: [],
    aiInsights: ['No hardware assets match the current filters.'],
  };
  const { filterOptions } = data;
  const tooltipStyle = {
    background: themeColors.panel,
    border: `1px solid ${themeColors.border}`,
    borderRadius: 3,
    fontSize: 11,
    color: themeColors.ink,
  };

  return (
    <div
      className="space-y-5"
      style={theme === 'dark' ? { background: themeColors.bg, margin: '-0.5rem', padding: '0.5rem', borderRadius: 6 } : undefined}
    >
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-1" style={{ color: themeColors.inkMute }}>
            Hardware EOL · Physical infrastructure
          </div>
          <h2 className="font-display text-xl font-semibold" style={{ color: themeColors.ink }}>
            Server, storage & network hardware lifecycle
          </h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1.5 flex items-center gap-1.5"
            style={{ background: themeColors.panelAlt, border: `1px solid ${themeColors.border}`, color: themeColors.inkSoft, borderRadius: 3 }}
          >
            {theme === 'light' ? <Moon size={12} /> : <Sun size={12} />}
            {theme === 'light' ? 'Dark' : 'Light'}
          </button>
          <button type="button" onClick={() => exportHardwareToCsv(filtered)} className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1.5 flex items-center gap-1.5" style={{ background: themeColors.panel, border: `1px solid ${themeColors.border}`, color: themeColors.inkSoft, borderRadius: 3 }}>
            <Download size={12} /> CSV
          </button>
          <button
            type="button"
            onClick={() => exportHardwareEolReport({ assets: filtered, summary, filters, env })}
            className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1.5 flex items-center gap-1.5"
            style={{ background: themeColors.panel, border: `1px solid ${themeColors.border}`, color: themeColors.inkSoft, borderRadius: 3 }}
          >
            <FileSpreadsheet size={12} /> Excel
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4 items-stretch">
        <div className="col-span-3 h-full flex"><Kpi size="large" label="Total assets" value={summary.totalAssets} icon={Server} /></div>
        <div className="col-span-3 h-full flex"><Kpi size="large" label="EOL compliant" value={summary.eolCompliantAssets} tone="ok" icon={ShieldCheck} /></div>
        <div className="col-span-3 h-full flex"><Kpi size="large" label="Non-compliant" value={summary.nonCompliantAssets} tone="crit" icon={AlertTriangle} /></div>
        <div className="col-span-3 h-full flex"><Kpi size="large" label="Critical EOL" value={summary.criticalEolAssets} tone="crit" icon={AlertTriangle} /></div>
        <div className="col-span-3 h-full flex"><Kpi size="large" label="Upcoming EOL" value={summary.upcomingEol90Days} unit="90d" tone="warn" icon={Clock} /></div>
        <div className="col-span-3 h-full flex"><Kpi size="large" label="Filtered view" value={filtered.length} tone="neutral" icon={HardDrive} /></div>
      </div>

      <Panel style={{ background: themeColors.panel, borderColor: themeColors.border }}>
        <SectionHead
          sub={activeFilterCount ? `${activeFilterCount} active · ${filtered.length} assets` : 'Slice hardware fleet'}
          title="Filters"
          action={
            activeFilterCount > 0 ? (
              <button type="button" onClick={clearFilters} className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.accent }}>
                Clear all
              </button>
            ) : null
          }
        />
        <div className="grid grid-cols-4 md:grid-cols-7 gap-3">
          <FilterSelect label="Vendor" value={filters.vendor} onChange={(v) => setFilter('vendor', v)} options={filterOptions.vendors} themeColors={themeColors} />
          <FilterSelect label="Asset type" value={filters.assetType} onChange={(v) => setFilter('assetType', v)} options={filterOptions.assetTypes} themeColors={themeColors} />
          <FilterSelect label="Environment" value={filters.environment} onChange={(v) => setFilter('environment', v)} options={filterOptions.environments} themeColors={themeColors} />
          <FilterSelect label="Compliance" value={filters.complianceStatus} onChange={(v) => setFilter('complianceStatus', v)} options={filterOptions.complianceStatuses} themeColors={themeColors} />
          <FilterSelect label="Risk" value={filters.riskRating} onChange={(v) => setFilter('riskRating', v)} options={filterOptions.riskRatings} themeColors={themeColors} />
          <FilterSelect label="Region" value={filters.region} onChange={(v) => setFilter('region', v)} options={filterOptions.regions} themeColors={themeColors} />
          <FilterSelect label="Location" value={filters.location} onChange={(v) => setFilter('location', v)} options={filterOptions.locations} themeColors={themeColors} />
        </div>
      </Panel>

      <div className="grid grid-cols-12 gap-4">
        <Panel className="col-span-4" style={{ background: themeColors.panel, borderColor: themeColors.border }}>
          <SectionHead sub="Fleet-wide" title="Hardware compliance status" />
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={view.compliancePie} dataKey="value" nameKey="name" innerRadius={50} outerRadius={78} paddingAngle={2}>
                {view.compliancePie.map((entry) => (
                  <Cell key={entry.name} fill={PIE_COLORS[entry.name] || C.inkMute} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10, color: themeColors.ink }} />
            </PieChart>
          </ResponsiveContainer>
        </Panel>
        <Panel className="col-span-8" style={{ background: themeColors.panel, borderColor: themeColors.border }}>
          <SectionHead sub="% compliant by type" title="Servers · Storage · Network" />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={view.byAssetType} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid stroke={themeColors.border} strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: themeColors.inkMute }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: themeColors.inkMute }} unit="%" axisLine={false} tickLine={false} width={36} domain={[0, 100]} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="compliant" name="Compliant %" fill={C.ok} radius={[2, 2, 0, 0]} />
              <Bar dataKey="nonCompliant" name="Non-compliant %" fill={C.crit} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Panel className="col-span-7" style={{ background: themeColors.panel, borderColor: themeColors.border }}>
          <SectionHead sub="12-month view" title="Hardware EOL trend" />
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={view.trend12m} margin={{ top: 5, right: 10, left: -5, bottom: 0 }}>
              <CartesianGrid stroke={themeColors.border} strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 9, fill: themeColors.inkMute }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: themeColors.inkMute }} axisLine={false} tickLine={false} width={36} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="upcomingEol" name="Upcoming EOL" stroke={C.warn} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="remediated" name="Remediated" stroke={C.ok} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="nonCompliant" name="Non-compliant" stroke={C.crit} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
        <Panel className="col-span-5" style={{ background: themeColors.panel, borderColor: themeColors.border }}>
          <SectionHead sub="Top vendors" title="Non-compliant by vendor" />
          <div className="space-y-2">
            {view.byVendor.map((v, i) => (
              <div key={v.name} className="flex items-center justify-between text-xs py-1.5 border-b" style={{ borderColor: themeColors.border }}>
                <span className="font-mono-num w-5" style={{ color: themeColors.inkMute }}>{i + 1}</span>
                <span className="flex-1 font-medium" style={{ color: themeColors.ink }}>{v.name}</span>
                <Pill tone="warn">{v.count}</Pill>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel style={{ background: themeColors.panel, borderColor: themeColors.border }}>
        <SectionHead sub="Critical & high risk" title="High-risk hardware assets" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {view.highRiskAssets.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setSelected(row)}
              className="text-left p-3 border rounded transition-colors hover:opacity-90"
              style={{ borderColor: riskColor(row.riskRating, theme), borderLeftWidth: 3, background: themeColors.panelAlt }}
            >
              <div className="font-mono-num text-[10px]" style={{ color: themeColors.inkMute }}>{row.id}</div>
              <div className="text-xs font-semibold mt-1 truncate" style={{ color: themeColors.ink }}>{row.assetName}</div>
              <div className="flex items-center gap-2 mt-2">
                <Pill tone={riskTone(row.riskRating)} size="xs">{row.riskRating}</Pill>
                <span className="font-mono-num text-[10px]" style={{ color: riskColor(row.riskRating, theme) }}>{row.daysRemaining}d</span>
              </div>
            </button>
          ))}
        </div>
      </Panel>

      <Panel style={{ background: themeColors.panel, borderColor: themeColors.border }}>
        <SectionHead sub="AIOps" title="AI insights" />
        <div className="space-y-2">
          {view.aiInsights.map((insight) => (
            <div key={insight} className="flex gap-2 text-xs p-2 rounded" style={{ background: themeColors.panelAlt, color: themeColors.inkSoft }}>
              <Sparkles size={12} style={{ color: '#7c3aed', flexShrink: 0, marginTop: 1 }} />
              {insight}
            </div>
          ))}
        </div>
      </Panel>

      <Panel padding="p-0" className="overflow-hidden" style={{ background: themeColors.panel, borderColor: themeColors.border }}>
        <div className="px-5 py-3 border-b" style={{ borderColor: themeColors.border }}>
          <SectionHead sub={`${filtered.length} assets`} title="Hardware asset inventory" />
        </div>
        <div className="overflow-x-auto scrollbar-thin max-h-[480px] overflow-y-auto">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 z-10" style={{ background: themeColors.panel }}>
              <tr style={{ borderBottom: `1px solid ${themeColors.border}` }}>
                {['Asset', 'Type', 'Vendor', 'Model', 'Serial', 'Firmware', 'EOL date', 'Env', 'Region', 'Location', 'Compliance', 'Risk', 'Days', 'Owner', 'Status'].map((h) => (
                  <th key={h} className="text-left font-medium py-2 px-2 text-[9px] uppercase tracking-wider whitespace-nowrap" style={{ color: themeColors.inkMute }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelected(row)}
                  className="cursor-pointer hover:opacity-90"
                  style={{ borderBottom: `1px solid ${themeColors.border}`, background: selected?.id === row.id ? C.accentSoft : undefined }}
                >
                  <td className="py-2 px-2 font-mono-num whitespace-nowrap" style={{ color: themeColors.ink }}>{row.assetName}</td>
                  <td className="py-2 px-2 whitespace-nowrap" style={{ color: themeColors.inkSoft }}>{row.assetType}</td>
                  <td className="py-2 px-2 whitespace-nowrap" style={{ color: themeColors.inkSoft }}>{row.vendor}</td>
                  <td className="py-2 px-2 whitespace-nowrap max-w-[100px] truncate" style={{ color: themeColors.inkSoft }}>{row.model}</td>
                  <td className="py-2 px-2 font-mono-num whitespace-nowrap" style={{ color: themeColors.inkMute }}>{row.serialNumber}</td>
                  <td className="py-2 px-2 font-mono-num whitespace-nowrap" style={{ color: themeColors.inkMute }}>{row.firmwareVersion}</td>
                  <td className="py-2 px-2 font-mono-num whitespace-nowrap" style={{ color: themeColors.inkSoft }}>{row.hardwareEolDate}</td>
                  <td className="py-2 px-2 whitespace-nowrap" style={{ color: themeColors.inkSoft }}>{row.environment}</td>
                  <td className="py-2 px-2 whitespace-nowrap" style={{ color: themeColors.inkSoft }}>{row.region}</td>
                  <td className="py-2 px-2 whitespace-nowrap" style={{ color: themeColors.inkSoft }}>{row.location}</td>
                  <td className="py-2 px-2"><Pill tone={complianceTone(row.complianceStatus)} size="xs">{row.complianceStatus}</Pill></td>
                  <td className="py-2 px-2"><span className="font-semibold" style={{ color: riskColor(row.riskRating, theme) }}>{row.riskRating}</span></td>
                  <td className="py-2 px-2 font-mono-num font-semibold" style={{ color: row.daysRemaining <= 30 ? C.crit : themeColors.ink }}>{row.daysRemaining}</td>
                  <td className="py-2 px-2 whitespace-nowrap" style={{ color: themeColors.inkSoft }}>{row.owner}</td>
                  <td className="py-2 px-2 whitespace-nowrap" style={{ color: themeColors.inkSoft }}>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <AssetModal asset={selected} onClose={() => setSelected(null)} themeColors={themeColors} />
    </div>
  );
}
