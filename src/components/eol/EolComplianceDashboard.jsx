import React, { useState, useEffect, useMemo } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
  CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  ShieldCheck, AlertTriangle, Clock, Server, Download, FileSpreadsheet,
  FileText, Moon, Sun, Sparkles, X, Plug, ChevronRight,
} from 'lucide-react';
import Panel from '../ui/Panel';
import Pill from '../ui/Pill';
import Kpi from '../ui/Kpi';
import TabBar from '../ui/TabBar';
import SectionHead from '../ui/SectionHead';
import HardwareEolDashboard from './HardwareEolDashboard';
import { C } from '../../theme/colors';
import { fetchEolComplianceDashboard } from '../../services/eolComplianceApi';
import { filterEolInstances, buildEolDerivedView, FUTURE_CONNECTORS } from '../../mock-data/eolCompliance';
import { riskTone, riskColor, complianceTone } from '../../utils/eolRisk';
import {
  exportInstancesToCsv,
  exportEolComplianceReport,
  exportInstancesToPdf,
} from '../../utils/eolExport';

const PIE_COLORS = {
  Compliant: C.ok,
  'Non-Compliant': C.crit,
  Exempted: C.info,
  Unknown: '#94a3b8',
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

export const EOL_COMPLIANCE_SUB_TABS = ['Software EOL', 'Hardware EOL'];

const DEFAULT_FILTERS = {
  cloudProvider: 'All',
  environment: 'All',
  application: 'All',
  databaseType: 'All',
  osType: 'All',
  complianceStatus: 'All',
  riskRating: 'All',
  region: 'All',
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

function DrillDownModal({ instance, onClose, theme, themeColors }) {
  if (!instance) return null;
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
            <div className="font-display font-semibold text-lg" style={{ color: themeColors.ink }}>{instance.instanceName}</div>
            <div className="text-xs mt-0.5" style={{ color: themeColors.inkSoft }}>{instance.id} · {instance.environment}</div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5" style={{ color: themeColors.inkMute }} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-5 text-sm">
          <div className="flex flex-wrap gap-2">
            <Pill tone={riskTone(instance.riskRating)}>{instance.riskRating}</Pill>
            <Pill tone={complianceTone(instance.complianceStatus)}>{instance.complianceStatus}</Pill>
            <Pill tone="neutral">{instance.daysRemaining} days remaining</Pill>
          </div>

          <section>
            <h3 className="text-[10px] uppercase tracking-widest font-bold mb-2" style={{ color: themeColors.inkMute }}>Infrastructure</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {Object.entries(instance.infrastructure).map(([k, v]) => (
                <div key={k} className="flex justify-between py-1 border-b" style={{ borderColor: themeColors.border }}>
                  <span style={{ color: themeColors.inkSoft }}>{k}</span>
                  <span className="font-mono-num font-semibold" style={{ color: themeColors.ink }}>{v}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-[10px] uppercase tracking-widest font-bold mb-2" style={{ color: themeColors.inkMute }}>Security product</h3>
            <p style={{ color: themeColors.ink }}>
              {instance.databaseType} {instance.databaseVersion} · EOL {instance.databaseEolDate}
            </p>
            <p className="text-xs mt-1" style={{ color: themeColors.inkSoft }}>Target: {instance.upgradeTargetVersion.split(' / ')[0]}</p>
          </section>

          <section>
            <h3 className="text-[10px] uppercase tracking-widest font-bold mb-2" style={{ color: themeColors.inkMute }}>Operating system</h3>
            <p style={{ color: themeColors.ink }}>
              {instance.osType} {instance.osVersion} · EOL {instance.osEolDate}
            </p>
          </section>

          <section>
            <h3 className="text-[10px] uppercase tracking-widest font-bold mb-2" style={{ color: themeColors.inkMute }}>Compliance findings</h3>
            <ul className="list-disc pl-4 space-y-1 text-xs" style={{ color: themeColors.inkSoft }}>
              {instance.complianceFindings.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-[10px] uppercase tracking-widest font-bold mb-2" style={{ color: themeColors.inkMute }}>Remediation</h3>
            <p className="text-xs mb-2" style={{ color: themeColors.inkSoft }}>
              Planned: <span className="font-mono-num" style={{ color: themeColors.ink }}>{instance.plannedRemediationDate}</span>
            </p>
            <ul className="space-y-1.5 text-xs" style={{ color: themeColors.ink }}>
              {instance.remediationActions.map((a) => (
                <li key={a} className="flex gap-2">
                  <ChevronRight size={12} style={{ color: C.accent, flexShrink: 0, marginTop: 2 }} />
                  {a}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function EolComplianceDashboard({ env }) {
  const [eolSubTab, setEolSubTab] = useState('Software EOL');
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
    fetchEolComplianceDashboard(env).then((payload) => {
      if (!cancelled) {
        setData(payload);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [env]);

  const filtered = useMemo(
    () => (data ? filterEolInstances(data.instances, filters) : []),
    [data, filters]
  );

  const derived = useMemo(
    () => (filtered.length ? buildEolDerivedView(filtered) : null),
    [filtered]
  );

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const clearFilters = () => setFilters(DEFAULT_FILTERS);

  const activeFilterCount = Object.values(filters).filter((v) => v !== 'All').length;

  if (eolSubTab === 'Hardware EOL') {
    return (
      <div className="space-y-5 col-span-12">
        <TabBar tabs={EOL_COMPLIANCE_SUB_TABS} active={eolSubTab} onChange={setEolSubTab} size="large" />
        <HardwareEolDashboard env={env} />
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="space-y-5 col-span-12">
        <TabBar tabs={EOL_COMPLIANCE_SUB_TABS} active={eolSubTab} onChange={setEolSubTab} size="large" />
        <Panel>
          <div className="py-16 text-center text-sm" style={{ color: C.inkMute }}>Loading software EOL compliance data…</div>
        </Panel>
      </div>
    );
  }

  const { filterOptions } = data;
  const summary = derived?.summary ?? {
    totalInstances: 0,
    eolCompliantInstances: 0,
    nonCompliantInstances: 0,
    criticalEolInstances: 0,
    upcomingEol90Days: 0,
  };
  const view = derived ?? {
    compliancePie: [],
    dbEolBar: [],
    osEolBar: [],
    internalBar: [],
    trend12m: [],
    topApplications: [],
    topBusinessUnits: [],
    complianceByEnv: [],
    highRiskAssets: [],
    aiInsights: ['No instances match the current filters.'],
  };
  const tooltipStyle = {
    background: themeColors.panel,
    border: `1px solid ${themeColors.border}`,
    borderRadius: 3,
    fontSize: 11,
    color: themeColors.ink,
  };

  const complianceBarMerged = view.dbEolBar.length
    ? [
        { name: 'Product EOL', compliant: Math.round(view.dbEolBar.reduce((s, r) => s + r.compliant, 0) / view.dbEolBar.length), nonCompliant: 0 },
        { name: 'OS EOL', compliant: Math.round(view.osEolBar.reduce((s, r) => s + r.compliant, 0) / view.osEolBar.length), nonCompliant: 0 },
        { name: 'Internal Std', compliant: Math.round(view.internalBar.reduce((s, r) => s + r.compliant, 0) / view.internalBar.length), nonCompliant: 0 },
      ].map((row) => ({
        ...row,
        nonCompliant: 100 - row.compliant,
      }))
    : [];

  return (
    <div
      className="space-y-5 col-span-12 eol-compliance-root"
      style={theme === 'dark' ? { background: themeColors.bg, margin: '-0.5rem', padding: '0.5rem', borderRadius: 6 } : undefined}
    >
      <TabBar tabs={EOL_COMPLIANCE_SUB_TABS} active={eolSubTab} onChange={setEolSubTab} size="large" />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-1" style={{ color: themeColors.inkMute }}>
            Software EOL · Security products & OS lifecycle
          </div>
          <h2 className="font-display text-xl font-semibold" style={{ color: themeColors.ink }}>
            Security products, OS & internal standard compliance
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
          <button type="button" onClick={() => exportInstancesToCsv(filtered)} className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1.5 flex items-center gap-1.5" style={{ background: themeColors.panel, border: `1px solid ${themeColors.border}`, color: themeColors.inkSoft, borderRadius: 3 }}>
            <Download size={12} /> CSV
          </button>
          <button
            type="button"
            onClick={() =>
              exportEolComplianceReport({
                instances: filtered,
                summary,
                filters,
                env,
                highRiskAssets: view.highRiskAssets,
              })
            }
            className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1.5 flex items-center gap-1.5"
            style={{ background: themeColors.panel, border: `1px solid ${themeColors.border}`, color: themeColors.inkSoft, borderRadius: 3 }}
            title="Download Excel with summary, filters, and instance data"
          >
            <FileSpreadsheet size={12} /> Excel
          </button>
          <button type="button" onClick={() => exportInstancesToPdf(filtered)} className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1.5 flex items-center gap-1.5" style={{ background: themeColors.panel, border: `1px solid ${themeColors.border}`, color: themeColors.inkSoft, borderRadius: 3 }}>
            <FileText size={12} /> PDF
          </button>
        </div>
      </div>

      {/* Section 1: Executive KPI Cards */}
      <div className="grid grid-cols-12 gap-4 items-stretch">
        <div className="col-span-3 h-full flex"><Kpi size="large" label="Total instances" value={summary.totalInstances} icon={Server} /></div>
        <div className="col-span-3 h-full flex"><Kpi size="large" label="EOL compliant" value={summary.eolCompliantInstances} tone="ok" icon={ShieldCheck} /></div>
        <div className="col-span-3 h-full flex"><Kpi size="large" label="Non-compliant" value={summary.nonCompliantInstances} tone="crit" icon={AlertTriangle} /></div>
        <div className="col-span-3 h-full flex"><Kpi size="large" label="Critical EOL" value={summary.criticalEolInstances} tone="crit" icon={AlertTriangle} /></div>
        <div className="col-span-3 h-full flex"><Kpi size="large" label="Upcoming EOL" value={summary.upcomingEol90Days} unit="90d" tone="warn" icon={Clock} /></div>
        <div className="col-span-3 h-full flex"><Kpi size="large" label="Filtered view" value={filtered.length} tone="neutral" icon={Server} /></div>
      </div>

      {/* Filters */}
      <Panel style={{ background: themeColors.panel, borderColor: themeColors.border }}>
        <SectionHead
          sub={activeFilterCount ? `${activeFilterCount} active · ${filtered.length} instances` : 'Slice fleet'}
          title="Filters"
          action={
            activeFilterCount > 0 ? (
              <button type="button" onClick={clearFilters} className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.accent }}>
                Clear all
              </button>
            ) : null
          }
        />
        <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
          <FilterSelect label="Cloud" value={filters.cloudProvider} onChange={(v) => setFilter('cloudProvider', v)} options={filterOptions.cloudProviders} themeColors={themeColors} />
          <FilterSelect label="Environment" value={filters.environment} onChange={(v) => setFilter('environment', v)} options={filterOptions.environments} themeColors={themeColors} />
          <FilterSelect label="Application" value={filters.application} onChange={(v) => setFilter('application', v)} options={filterOptions.applications} themeColors={themeColors} />
          <FilterSelect label="Product" value={filters.databaseType} onChange={(v) => setFilter('databaseType', v)} options={filterOptions.databaseTypes} themeColors={themeColors} />
          <FilterSelect label="OS type" value={filters.osType} onChange={(v) => setFilter('osType', v)} options={filterOptions.osTypes} themeColors={themeColors} />
          <FilterSelect label="Compliance" value={filters.complianceStatus} onChange={(v) => setFilter('complianceStatus', v)} options={filterOptions.complianceStatuses} themeColors={themeColors} />
          <FilterSelect label="Risk" value={filters.riskRating} onChange={(v) => setFilter('riskRating', v)} options={filterOptions.riskRatings} themeColors={themeColors} />
          <FilterSelect label="Region" value={filters.region} onChange={(v) => setFilter('region', v)} options={filterOptions.regions} themeColors={themeColors} />
        </div>
      </Panel>

      {/* Section 2: Compliance Overview Charts */}
      <div className="grid grid-cols-12 gap-4">
        <Panel className="col-span-4" style={{ background: themeColors.panel, borderColor: themeColors.border }}>
          <SectionHead sub="Fleet-wide" title="Compliance status distribution" />
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
          <SectionHead sub="% compliant by category" title="Security product · OS · Internal standard" />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={complianceBarMerged} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
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

      {/* Section 3: EOL Trend + Executive KPIs */}
      <div className="grid grid-cols-12 gap-4">
        <Panel className="col-span-7" style={{ background: themeColors.panel, borderColor: themeColors.border }}>
          <SectionHead sub="12-month view" title="EOL trend analysis" />
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
          <SectionHead sub="By environment" title="Compliance percentage" />
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={view.complianceByEnv} layout="vertical" margin={{ top: 5, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={themeColors.border} strokeDasharray="2 4" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: themeColors.inkMute }} unit="%" />
              <YAxis type="category" dataKey="environment" width={72} tick={{ fontSize: 10, fill: themeColors.ink }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="pct" name="Compliant %" fill={C.accent} barSize={14} radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Panel className="col-span-4" style={{ background: themeColors.panel, borderColor: themeColors.border }}>
          <SectionHead sub="Top 10" title="Applications with EOL risk" />
          <div className="space-y-2">
            {view.topApplications.map((a, i) => (
              <div key={a.name} className="flex items-center justify-between text-xs py-1.5 border-b" style={{ borderColor: themeColors.border }}>
                <span className="font-mono-num w-5" style={{ color: themeColors.inkMute }}>{i + 1}</span>
                <span className="flex-1 truncate font-medium" style={{ color: themeColors.ink }}>{a.name}</span>
                <Pill tone="warn">{a.riskCount}</Pill>
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="col-span-4" style={{ background: themeColors.panel, borderColor: themeColors.border }}>
          <SectionHead sub="Top 10" title="Business units · non-compliant" />
          <div className="space-y-2">
            {view.topBusinessUnits.map((b, i) => (
              <div key={b.name} className="flex items-center justify-between text-xs py-1.5 border-b" style={{ borderColor: themeColors.border }}>
                <span className="font-mono-num w-5" style={{ color: themeColors.inkMute }}>{i + 1}</span>
                <span className="flex-1 truncate font-medium" style={{ color: themeColors.ink }}>{b.name}</span>
                <Pill tone="crit">{b.count}</Pill>
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="col-span-4" style={{ background: themeColors.panel, borderColor: themeColors.border }}>
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
      </div>

      {/* Section 4: High-Risk Assets */}
      <Panel style={{ background: themeColors.panel, borderColor: themeColors.border }}>
        <SectionHead sub="Critical & high risk" title="High-risk assets" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {view.highRiskAssets.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setSelected(row)}
              className="text-left p-3 border rounded transition-colors hover:opacity-90"
              style={{
                borderColor: riskColor(row.riskRating, theme),
                borderLeftWidth: 3,
                background: themeColors.panelAlt,
              }}
            >
              <div className="font-mono-num text-[10px]" style={{ color: themeColors.inkMute }}>{row.id}</div>
              <div className="text-xs font-semibold mt-1 truncate" style={{ color: themeColors.ink }}>{row.instanceName}</div>
              <div className="flex items-center gap-2 mt-2">
                <Pill tone={riskTone(row.riskRating)} size="xs">{row.riskRating}</Pill>
                <span className="font-mono-num text-[10px]" style={{ color: riskColor(row.riskRating, theme) }}>
                  {row.daysRemaining}d
                </span>
              </div>
            </button>
          ))}
        </div>
      </Panel>

      {/* Future connectors */}
      <Panel style={{ background: themeColors.panel, borderColor: themeColors.border }}>
        <SectionHead sub="Integration-ready" title="Future connector framework" action={<Plug size={14} style={{ color: themeColors.inkMute }} />} />
        <div className="flex flex-wrap gap-2">
          {FUTURE_CONNECTORS.map((name) => (
            <span
              key={name}
              className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1"
              style={{ background: themeColors.panelAlt, border: `1px solid ${themeColors.border}`, color: themeColors.inkSoft, borderRadius: 3 }}
            >
              {name}
            </span>
          ))}
        </div>
      </Panel>

      {/* Section 5: Instance Table */}
      <Panel padding="p-0" className="overflow-hidden" style={{ background: themeColors.panel, borderColor: themeColors.border }}>
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: themeColors.border }}>
          <SectionHead sub={`${filtered.length} instances`} title="Instance EOL table" />
          <span className="text-[10px] uppercase tracking-wider" style={{ color: themeColors.inkMute }}>Click row for drill-down</span>
        </div>
        <div className="overflow-x-auto scrollbar-thin max-h-[480px] overflow-y-auto">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 z-10" style={{ background: themeColors.panel }}>
              <tr style={{ borderBottom: `1px solid ${themeColors.border}` }}>
                {[
                  'Instance', 'Env', 'Application', 'Cloud', 'DB Type', 'DB Ver', 'DB EOL',
                  'OS', 'OS Ver', 'OS EOL', 'Internal', 'Risk', 'Days', 'Owner', 'Region', 'Status',
                ].map((h) => (
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
                  style={{ borderBottom: `1px solid ${themeColors.border}`, background: selected?.id === row.id ? themeColors.accentSoft || C.accentSoft : undefined }}
                >
                  <td className="py-2 px-2 font-mono-num whitespace-nowrap" style={{ color: themeColors.ink }}>{row.instanceName}</td>
                  <td className="py-2 px-2 whitespace-nowrap" style={{ color: themeColors.inkSoft }}>{row.environment}</td>
                  <td className="py-2 px-2 whitespace-nowrap max-w-[120px] truncate" style={{ color: themeColors.inkSoft }}>{row.application}</td>
                  <td className="py-2 px-2 whitespace-nowrap" style={{ color: themeColors.inkSoft }}>{row.cloudProvider}</td>
                  <td className="py-2 px-2 whitespace-nowrap" style={{ color: themeColors.inkSoft }}>{row.databaseType}</td>
                  <td className="py-2 px-2 font-mono-num whitespace-nowrap" style={{ color: themeColors.ink }}>{row.databaseVersion}</td>
                  <td className="py-2 px-2 font-mono-num whitespace-nowrap" style={{ color: themeColors.inkSoft }}>{row.databaseEolDate}</td>
                  <td className="py-2 px-2 whitespace-nowrap" style={{ color: themeColors.inkSoft }}>{row.osType}</td>
                  <td className="py-2 px-2 font-mono-num whitespace-nowrap" style={{ color: themeColors.inkSoft }}>{row.osVersion}</td>
                  <td className="py-2 px-2 font-mono-num whitespace-nowrap" style={{ color: themeColors.inkSoft }}>{row.osEolDate}</td>
                  <td className="py-2 px-2"><Pill tone={complianceTone(row.internalComplianceStatus)} size="xs">{row.internalComplianceStatus}</Pill></td>
                  <td className="py-2 px-2">
                    <span className="font-semibold" style={{ color: riskColor(row.riskRating, theme) }}>{row.riskRating}</span>
                  </td>
                  <td className="py-2 px-2 font-mono-num font-semibold" style={{ color: row.daysRemaining <= 30 ? C.crit : themeColors.ink }}>{row.daysRemaining}</td>
                  <td className="py-2 px-2 whitespace-nowrap" style={{ color: themeColors.inkSoft }}>{row.owner}</td>
                  <td className="py-2 px-2 whitespace-nowrap" style={{ color: themeColors.inkSoft }}>{row.region}</td>
                  <td className="py-2 px-2 whitespace-nowrap" style={{ color: themeColors.inkSoft }}>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <DrillDownModal instance={selected} onClose={() => setSelected(null)} theme={theme} themeColors={themeColors} />
    </div>
  );
}
