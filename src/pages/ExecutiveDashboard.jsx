import React, { useState, useMemo, useEffect } from 'react';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Legend,
  LineChart, Line,
} from 'recharts';
import {
  Database, CircleAlert, ShieldCheck, Sparkles, AlertOctagon,
  AlertTriangle, Clock, TrendingUp, Filter, Download, Globe,
  Activity, FileCheck, DollarSign, Brain, HardDrive, Archive,
  Server, Cloud, Users, UserCheck,
} from 'lucide-react';
import Panel from '../components/ui/Panel';
import Pill from '../components/ui/Pill';
import Kpi from '../components/ui/Kpi';
import TabBar from '../components/ui/TabBar';
import SectionHead from '../components/ui/SectionHead';
import { C } from '../theme/colors';
import { COMPLIANCE } from '../mock-data/compliance';
import { DB_TYPES, REGIONS } from '../mock-data/helpers';
import { EXECUTIVE_TABS, EXECUTIVE_TAB_META } from '../mock-data/executive';
import {
  ALL_ENVS,
  getTotalsForEnv,
  getEnvMetrics,
  formatSpend,
  getTrendForEnv,
  getRegionHealthForEnv,
  getCostBreakdownForEnv,
  getCspOptimizationsForEnv,
  getAiRecsForEnv,
  getComplianceForEnv,
  envIndex,
} from '../mock-data/envScope';
import { getStorageForEnv, formatStorageTb } from '../mock-data/storage';
import StoragePlatformSection from '../components/storage/StoragePlatformSection';
import {
  getInstancesForEnv,
  getInstanceProfile,
  INSTANCE_HOST_TYPES,
} from '../mock-data/instances';
import EolComplianceDashboard from '../components/eol/EolComplianceDashboard';
import DashboardFiltersPanel, {
  EXECUTIVE_DEFAULT_FILTERS,
  countActiveFilters,
} from '../components/ui/DashboardFiltersPanel';
import {
  applyExecutiveTotals,
  applyExecutiveMetrics,
  applyExecutiveStorage,
  applyExecutiveTrend,
  applyExecutiveCost,
  applyExecutiveCspOptimizations,
  applyInstanceProfile,
  applyInstancesSummary,
  fleetFraction,
  executiveFilterSalt,
  hasExecutiveFilters,
} from '../mock-data/executiveFilters';
import { exportExecutiveDashboardExcel } from '../utils/executiveExport';

const COST_SUB_TABS = ['Cloud Security', 'Programs'];
import CostOptimizationPanel from '../components/executive/CostOptimizationPanel';
import CostSavingsDashboard from '../components/executive/CostSavingsDashboard';
import { buildCostSavingsDashboard } from '../mock-data/costSavings';
import { buildOnPremCost } from '../mock-data/onPremCost';
import OnPremCostSection from '../components/executive/OnPremCostSection';

const heatSeed = (i, j, salt = 0) => {
  const x = Math.sin((i + 1) * 7919 + (j + 1) * 104729 + salt * 1337) * 10000;
  return Math.floor((x - Math.floor(x)) * 100);
};

function ExecutiveKpis({ tab, sparkData, totals, metrics, aiRecCount, storage, instanceProfile, costSavings, onPremCost }) {
  const { totalDbs, totalCrit } = totals;
  switch (tab) {
    case 'Threat Ops':
      return (
        <>
          <div className="col-span-3"><Kpi label="Protected Assets" value={totalDbs.toLocaleString()} icon={ShieldCheck} sparkData={sparkData} /></div>
          <div className="col-span-3"><Kpi label="Open Incidents" value={String(metrics.openIncidents)} tone="warn" delta={-8.4} icon={AlertOctagon} /></div>
          <div className="col-span-3"><Kpi label="MTTR" value={String(metrics.mttr)} unit="min" tone="ok" delta={-18.2} icon={Clock} /></div>
          <div className="col-span-3"><Kpi label="SLA Violations" value={String(metrics.slaViolations)} unit="MTD" tone="crit" icon={AlertTriangle} /></div>
        </>
      );
    case 'Security':
      return (
        <>
          <div className="col-span-3"><Kpi label="Compliance Score" value={String(metrics.complianceScore)} unit="/100" tone="ok" delta={1.8} icon={ShieldCheck} sparkData={sparkData} /></div>
          <div className="col-span-3"><Kpi label="Critical Vulns" value={String(metrics.criticalVulns)} tone="crit" delta={-21.4} icon={CircleAlert} /></div>
          <div className="col-span-3"><Kpi label="IAM Violations" value={String(metrics.iamViolations)} tone="warn" delta={-5.2} icon={AlertOctagon} /></div>
          <div className="col-span-3"><Kpi label="Encrypted at Rest" value={String(metrics.encryptedPct)} unit="%" tone="ok" delta={1.2} icon={ShieldCheck} /></div>
        </>
      );
    case 'Governance':
      return (
        <>
          <div className="col-span-3"><Kpi label="Avg Compliance" value={String(metrics.complianceScore)} unit="/100" tone="ok" delta={0.9} icon={FileCheck} sparkData={sparkData} /></div>
          <div className="col-span-3"><Kpi label="Frameworks" value="6" unit="active" icon={ShieldCheck} /></div>
          <div className="col-span-3"><Kpi label="Audit Findings" value={String(metrics.auditFindings)} tone="warn" delta={-4} icon={AlertTriangle} /></div>
          <div className="col-span-3"><Kpi label="Policy Gaps" value={String(metrics.policyGaps)} tone="crit" delta={2} icon={CircleAlert} /></div>
        </>
      );
    case 'Risk':
      return (
        <>
          <div className="col-span-3"><Kpi label="Total Spend" value={formatSpend(metrics.monthlySpend)} tone="warn" delta={metrics.forecastDelta} icon={DollarSign} sparkData={sparkData} /></div>
          <div className="col-span-3"><Kpi label="Cloud MTD" value={formatSpend(onPremCost?.cloudSpend ?? metrics.computeSpend)} unit="MTD" icon={Cloud} /></div>
          <div className="col-span-3"><Kpi label="On-Prem MTD" value={formatSpend(onPremCost?.monthlySpend ?? 0)} unit="MTD" icon={Server} /></div>
          <div className="col-span-3"><Kpi label="vs Forecast" value={`+${metrics.forecastDelta}`} unit="%" tone="warn" icon={Activity} /></div>
        </>
      );
    case 'Data Assets':
      return (
        <>
          <div className="col-span-3"><Kpi label="Total Capacity" value={formatStorageTb(storage.totalTb)} icon={HardDrive} sparkData={sparkData} /></div>
          <div className="col-span-3"><Kpi label="Classified Data" value={formatStorageTb(storage.usedTb)} tone="warn" delta={storage.growthPct30d} icon={HardDrive} /></div>
          <div className="col-span-3"><Kpi label="Available" value={formatStorageTb(storage.availableTb)} tone="ok" icon={Archive} /></div>
          <div className="col-span-3"><Kpi label="Utilization" value={String(storage.utilizationPct)} unit="%" tone={storage.utilizationPct >= 90 ? 'crit' : storage.utilizationPct >= 80 ? 'warn' : 'ok'} icon={TrendingUp} /></div>
        </>
      );
    case 'Assets':
      return (
        <>
          <div className="col-span-3"><Kpi label="Hosts" value={instanceProfile.hostCount.toLocaleString()} icon={instanceProfile.kind === 'VMs' ? Cloud : Server} sparkData={sparkData} /></div>
          <div className="col-span-3"><Kpi label="Monitored Assets" value={instanceProfile.dbCount.toLocaleString()} icon={ShieldCheck} /></div>
          <div className="col-span-3"><Kpi label="Data on hosts" value={formatStorageTb(instanceProfile.usedStorageTb)} tone="warn" icon={HardDrive} /></div>
          <div className="col-span-3"><Kpi label="Unique users" value={instanceProfile.uniqueUsers.toLocaleString()} icon={Users} /></div>
        </>
      );
    case 'AI Security':
      return (
        <>
          <div className="col-span-3"><Kpi label="AI Auto-Healed" value={String(metrics.aiAutoHealed)} unit="/30d" tone="ok" delta={34.2} icon={Sparkles} sparkData={sparkData} /></div>
          <div className="col-span-3"><Kpi label="Active Recommendations" value={aiRecCount} icon={Brain} /></div>
          <div className="col-span-3"><Kpi label="Avg Confidence" value={String(metrics.aiConfidence)} unit="%" tone="ok" delta={3.2} icon={Activity} /></div>
          <div className="col-span-3"><Kpi label="Cost Avoided" value={formatSpend(metrics.costAvoided)} tone="ok" delta={18} icon={TrendingUp} /></div>
        </>
      );
    default:
      return (
        <>
          <div className="col-span-3"><Kpi label="Protected Assets" value={totalDbs.toLocaleString()} delta={2.4} icon={ShieldCheck} sparkData={sparkData} /></div>
          <div className="col-span-3"><Kpi label="Critical Issues" value={totalCrit} tone="crit" delta={-12.3} icon={CircleAlert} sparkData={sparkData} /></div>
          <div className="col-span-3"><Kpi label="Compliance Score" value={String(metrics.complianceScore)} unit="/100" tone="ok" delta={1.8} icon={ShieldCheck} sparkData={sparkData} /></div>
          <div className="col-span-3"><Kpi label="AI Auto-Healed" value={String(metrics.aiAutoHealed)} unit="/30d" tone="ok" delta={34.2} icon={Sparkles} sparkData={sparkData} /></div>
          <div className="col-span-3"><Kpi label="Cost Saved MTD" value={formatSpend(costSavings?.mtdRealized ?? metrics.costAvoided)} tone="ok" delta={12.4} icon={DollarSign} /></div>
          <div className="col-span-3"><Kpi label="Open Incidents" value={String(metrics.openIncidents)} delta={-8.4} icon={AlertOctagon} /></div>
          <div className="col-span-3"><Kpi label="SLA Violations" value={String(metrics.slaViolations)} unit="MTD" tone="warn" icon={AlertTriangle} /></div>
          <div className="col-span-3"><Kpi label="MTTR" value={String(metrics.mttr)} unit="min" tone="ok" delta={-18.2} icon={Clock} /></div>
        </>
      );
  }
}

export default function ExecutiveDashboard({ env = ALL_ENVS }) {
  const [tab, setTab] = useState('Summary');
  const [costSubTab, setCostSubTab] = useState('Cloud Security');
  const [instanceHostType, setInstanceHostType] = useState('VMs');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(EXECUTIVE_DEFAULT_FILTERS);
  const meta = EXECUTIVE_TAB_META[tab];
  const tabSalt = EXECUTIVE_TABS.indexOf(tab);

  useEffect(() => {
    setFilters(EXECUTIVE_DEFAULT_FILTERS);
    setShowFilters(false);
  }, [env]);

  useEffect(() => {
    if (tab !== 'Risk') setCostSubTab('Cloud Security');
  }, [tab]);

  const baseTotals = useMemo(() => getTotalsForEnv(env), [env]);
  const baseInstances = useMemo(() => getInstancesForEnv(env), [env]);
  const baseInstanceProfile = useMemo(
    () => getInstanceProfile(baseInstances, instanceHostType),
    [baseInstances, instanceHostType]
  );
  const baseMetrics = useMemo(() => getEnvMetrics(env), [env]);
  const baseTrendData = useMemo(() => getTrendForEnv(env, tabSalt), [env, tabSalt]);
  const regionHealth = useMemo(() => getRegionHealthForEnv(env), [env]);
  const baseCostBreakdown = useMemo(() => getCostBreakdownForEnv(env), [env]);
  const baseCspOptimizations = useMemo(() => getCspOptimizationsForEnv(env), [env]);
  const aiRecs = useMemo(() => getAiRecsForEnv(env), [env]);
  const compliance = useMemo(() => getComplianceForEnv(env, COMPLIANCE), [env]);
  const baseStorage = useMemo(() => getStorageForEnv(env), [env]);
  const filterSalt = useMemo(() => executiveFilterSalt(filters), [filters]);
  const envSaltVal = useMemo(() => envIndex(env) * 7 + tabSalt + filterSalt, [env, tabSalt, filterSalt]);

  const totals = useMemo(
    () => applyExecutiveTotals(baseTotals, regionHealth, filters),
    [baseTotals, regionHealth, filters]
  );
  const fleetFrac = useMemo(() => fleetFraction(totals, baseTotals), [totals, baseTotals]);
  const metrics = useMemo(() => applyExecutiveMetrics(baseMetrics, fleetFrac), [baseMetrics, fleetFrac]);
  const storage = useMemo(() => applyExecutiveStorage(baseStorage, filters), [baseStorage, filters]);
  const trendData = useMemo(() => applyExecutiveTrend(baseTrendData, fleetFrac), [baseTrendData, fleetFrac]);
  const costBreakdown = useMemo(() => applyExecutiveCost(baseCostBreakdown, fleetFrac), [baseCostBreakdown, fleetFrac]);
  const cspOptimizations = useMemo(
    () => applyExecutiveCspOptimizations(baseCspOptimizations, fleetFrac),
    [baseCspOptimizations, fleetFrac]
  );
  const costSavings = useMemo(
    () => buildCostSavingsDashboard(metrics, cspOptimizations, fleetFrac),
    [metrics, cspOptimizations, fleetFrac]
  );
  const onPremCost = useMemo(
    () => buildOnPremCost(metrics.monthlySpend, env, fleetFrac),
    [metrics.monthlySpend, env, fleetFrac]
  );
  const cloudCostBreakdown = useMemo(() => {
    const baseSum = costBreakdown.reduce((s, c) => s + c.value, 0);
    const cloudTotal = onPremCost.cloudSpend;
    if (!baseSum || !cloudTotal) return costBreakdown;
    return costBreakdown.map((c) => ({
      ...c,
      value: Math.round((c.value / baseSum) * cloudTotal),
    }));
  }, [costBreakdown, onPremCost.cloudSpend]);
  const instances = useMemo(
    () => applyInstancesSummary(baseInstances, fleetFrac, filters),
    [baseInstances, fleetFrac, filters]
  );
  const instanceProfile = useMemo(
    () => applyInstanceProfile(baseInstanceProfile, fleetFrac, filters, baseInstanceProfile.hosts),
    [baseInstanceProfile, fleetFrac, filters]
  );

  const storageCategoryChart = useMemo(
    () => storage.byCategory.map((c) => ({ name: c.name.split('/')[0].trim().slice(0, 12), used: c.used, available: c.available })),
    [storage]
  );
  const storageDbChart = useMemo(
    () => storage.byDbType.map((d) => ({ name: d.type.split(' ')[0], used: d.used, available: d.available })),
    [storage]
  );

  const sparkData = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ v: heatSeed(i, 0, envSaltVal + 1) })),
    [envSaltVal]
  );

  const heatmap = useMemo(
    () =>
      DB_TYPES.map((t, ti) => ({
        type: t,
        cells: REGIONS.map((r, ri) => ({ region: r, v: heatSeed(ti, ri, envSaltVal + 10) })),
      })),
    [envSaltVal]
  );

  const activeFilterCount = countActiveFilters(filters);

  const heatmapRegions = useMemo(
    () => (filters.region === 'All' ? REGIONS : REGIONS.filter((r) => r === filters.region)),
    [filters.region]
  );

  const filteredRegionHealth = useMemo(
    () => (filters.region === 'All' ? regionHealth : regionHealth.filter((r) => r.region === filters.region)),
    [regionHealth, filters.region]
  );

  const filteredHeatmap = useMemo(() => {
    let rows = heatmap;
    if (filters.dbType !== 'All') rows = rows.filter((row) => row.type === filters.dbType);
    return rows.map((row) => ({
      ...row,
      cells:
        filters.region === 'All'
          ? row.cells
          : row.cells.filter((cell) => cell.region === filters.region),
    }));
  }, [heatmap, filters]);

  const filteredStorageByRegion = storage.byRegion;

  const filteredInstanceHosts = instanceProfile.hosts;

  const filteredInstanceByRegion = instanceProfile.byRegion;

  const setExecutiveFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const handleExportExcel = () => {
    exportExecutiveDashboardExcel({
      tab,
      env,
      filters,
      instanceHostType,
      totals,
      metrics,
      trendData,
      regionHealth: filteredRegionHealth,
      compliance,
      costBreakdown,
      storage,
      heatmap: filteredHeatmap,
      heatmapRegions,
      instanceProfile,
      aiRecs,
      eolFilters: {
        cloudProvider: 'All',
        environment: 'All',
        application: 'All',
        databaseType: filters.dbType,
        osType: 'All',
        complianceStatus: 'All',
        riskRating: 'All',
        region: filters.region,
      },
    });
  };

  const showTrend = ['Summary', 'Threat Ops', 'AI Security'].includes(tab);
  const showHealthPie = ['Summary', 'Threat Ops'].includes(tab);
  const showCost = tab === 'Risk';
  const showCostCloud = showCost && costSubTab === 'Cloud Security';
  const showCostOnPrem = showCost && costSubTab === 'Programs';
  const showRegional = ['Summary', 'Threat Ops'].includes(tab) || showCostCloud;
  const showHeatmap = ['Summary', 'Security', 'Threat Ops'].includes(tab);
  const showGovernance = tab === 'Governance';
  const showStorage = tab === 'Data Assets';
  const showInstances = tab === 'Assets';
  const showAiRecs = tab === 'AI Security';

  return (
    <div className="space-y-5">
      <div className="azure-commandbar flex items-end justify-between px-5 py-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-1" style={{ color: C.inkMute }}>
            {meta.eyebrow}
          </div>
          <h1 className="font-display text-2xl font-semibold" style={{ color: C.ink }}>
            {meta.title}{' '}
            {tab === 'Summary' ? (
              <span style={{ color: C.accent }}>{totals.totalDbs.toLocaleString()}</span>
            ) : tab === 'Data Assets' ? (
              <span style={{ color: C.accent }}>{formatStorageTb(storage.usedTb)}</span>
            ) : tab === 'Assets' ? (
              <span style={{ color: C.accent }}>{instances.combined.hostCount.toLocaleString()}</span>
            ) : (
              <span style={{ color: C.accent }}>{meta.highlight}</span>
            )}{' '}
            {tab === 'Summary' && 'protected assets'}
            {tab === 'Data Assets' && ` classified · ${storage.utilizationPct}% of ${formatStorageTb(storage.totalTb)}`}
            {tab === 'Assets' && ` hosts · ${formatStorageTb(instances.combined.usedStorageTb)} data · ${instances.combined.uniqueUsers.toLocaleString()} identities`}
          </h1>
          {tab === 'Assets' && (
            <div className="text-xs mt-1" style={{ color: C.inkSoft }}>
              VMs {instances.vms.hostCount.toLocaleString()} hosts · Bare metal {instances.bareMetal.hostCount.toLocaleString()} hosts · {env}
            </div>
          )}
          {tab === 'Summary' && (
            <div className="text-xs mt-1" style={{ color: C.inkSoft }}>
              {hasExecutiveFilters(filters)
                ? `Filtered · ${filters.region !== 'All' ? filters.region : 'all regions'} · ${filters.dbType !== 'All' ? filters.dbType : 'all domains'}`
                : env === ALL_ENVS
                  ? '7 regions · 4 environments · 19 active integrations'
                  : `${env} scope · filtered fleet view`}
            </div>
          )}
          {tab !== 'Summary' && tab !== 'Assets' && (
            <div className="text-xs mt-1" style={{ color: C.inkSoft }}>
              Azure-inspired executive surface for posture, spend, governance, and operational readiness.
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 flex items-center gap-1.5"
            style={{
              background: showFilters || activeFilterCount ? C.accentSoft : C.panel,
              border: `1px solid ${showFilters || activeFilterCount ? C.accent : C.border}`,
              color: showFilters || activeFilterCount ? C.accentHover : C.inkSoft,
              borderRadius: 6,
            }}
          >
            <Filter size={12} /> Filters
            {activeFilterCount > 0 && (
              <span className="font-mono-num text-[9px] px-1.5 py-0.5 rounded" style={{ background: C.accent, color: '#fff' }}>
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 flex items-center gap-1.5 hover:opacity-90 transition-opacity"
            style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.inkSoft, borderRadius: 6 }}
            title="Download Excel workbook with current view data"
          >
            <Download size={12} /> Export Excel
          </button>
        </div>
      </div>

      <TabBar tabs={EXECUTIVE_TABS} active={tab} onChange={setTab} />

      {showCost && (
        <TabBar tabs={COST_SUB_TABS} active={costSubTab} onChange={setCostSubTab} size="large" />
      )}

      {showFilters && (
        <DashboardFiltersPanel
          filters={filters}
          onChange={setExecutiveFilter}
          onClear={() => setFilters(EXECUTIVE_DEFAULT_FILTERS)}
          regionOptions={REGIONS}
          dbTypeOptions={DB_TYPES}
        />
      )}

      {!(showInstances && instanceHostType === 'EOL Compliance') && (
        <div className="grid grid-cols-12 gap-4">
          <ExecutiveKpis tab={tab} sparkData={sparkData} totals={totals} metrics={metrics} aiRecCount={aiRecs.length} storage={storage} instanceProfile={instanceProfile} costSavings={costSavings} onPremCost={onPremCost} />
        </div>
      )}

      {tab === 'Summary' && (
        <div className="grid grid-cols-12 gap-4">
          <CostSavingsDashboard savings={costSavings} onViewCostTab={() => setTab('Risk')} />
        </div>
      )}

      {showInstances && (
        <>
          <TabBar tabs={INSTANCE_HOST_TYPES} active={instanceHostType} onChange={setInstanceHostType} />
          {instanceHostType === 'EOL Compliance' ? (
            <EolComplianceDashboard env={env} />
          ) : (
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-3"><Kpi label="Active sessions" value={instanceProfile.activeSessions.toLocaleString()} tone="ok" icon={UserCheck} /></div>
            <div className="col-span-3"><Kpi label="Privileged users" value={instanceProfile.privilegedUsers.toLocaleString()} tone="warn" icon={Users} /></div>
            <div className="col-span-3"><Kpi label="Avg CPU" value={String(instanceProfile.avgCpuPct)} unit="%" icon={Activity} /></div>
            <div className="col-span-3"><Kpi label="Avg memory" value={String(instanceProfile.avgMemPct)} unit="%" icon={Server} /></div>
          </div>
          )}
        </>
      )}

      <div className="grid grid-cols-12 gap-4">
        {showTrend && (
          <Panel className={showHealthPie ? 'col-span-8' : 'col-span-12'}>
            <SectionHead
              sub={hasExecutiveFilters(filters) ? `Filtered fleet · ${(fleetFrac * 100).toFixed(0)}% of total` : '30-day trend'}
              title={tab === 'AI Security' ? 'AI threat auto-remediation velocity' : 'Incident velocity & resolution'}
              action={
                <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider" style={{ color: C.inkMute }}>
                  {tab !== 'AI Security' && (
                    <>
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2" style={{ background: C.crit }} />Raised</span>
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2" style={{ background: C.accent }} />Resolved</span>
                    </>
                  )}
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2" style={{ background: '#7c3aed' }} />AI Auto-Healed</span>
                </div>
              }
            />
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={trendData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.crit} stopOpacity={0.25} /><stop offset="100%" stopColor={C.crit} stopOpacity={0} /></linearGradient>
                  <linearGradient id="gRes" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.accent} stopOpacity={0.3} /><stop offset="100%" stopColor={C.accent} stopOpacity={0} /></linearGradient>
                  <linearGradient id="gAI" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7c3aed" stopOpacity={0.3} /><stop offset="100%" stopColor="#7c3aed" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} width={36} />
                <Tooltip contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 11 }} />
                {tab !== 'AI Security' && <Area type="monotone" dataKey="incidents" stroke={C.crit} strokeWidth={1.6} fill="url(#gIn)" />}
                {tab !== 'AI Security' && <Area type="monotone" dataKey="resolved" stroke={C.accent} strokeWidth={1.6} fill="url(#gRes)" />}
                <Area type="monotone" dataKey="autoHealed" stroke="#7c3aed" strokeWidth={1.6} fill="url(#gAI)" />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>
        )}

        {showHealthPie && (
          <Panel className="col-span-4">
            <SectionHead sub="Asset estate" title="Security health distribution" />
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={[{ name: 'Healthy', value: totals.totalOk }, { name: 'Warning', value: totals.totalWarn }, { name: 'Critical', value: totals.totalCrit }]} dataKey="value" innerRadius={50} outerRadius={75} paddingAngle={2}>
                  {[C.ok, C.warn, C.crit].map((c, i) => <Cell key={i} fill={c} />)}
                </Pie>
                <Tooltip contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </Panel>
        )}

        {showGovernance && (
          <Panel className="col-span-12">
            <SectionHead sub="Compliance frameworks" title="Governance posture by standard" />
            <div className="grid grid-cols-2 gap-4">
              {compliance.map((c) => (
                <div key={c.framework} className="flex items-center gap-3 py-2 border-b" style={{ borderColor: C.border }}>
                  <div className="flex-1">
                    <div className="text-sm font-medium" style={{ color: C.ink }}>{c.framework}</div>
                    <div className="text-[10px] font-mono-num" style={{ color: C.inkMute }}>{c.passed}/{c.total} controls · {c.failed} failing</div>
                  </div>
                  <div className="font-mono-num text-xl font-bold" style={{ color: c.score >= 90 ? C.ok : c.score >= 80 ? C.warn : C.crit }}>{c.score}</div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {showStorage && (
          <>
            <StoragePlatformSection storage={storage} />
            <Panel className="col-span-6">
              <SectionHead sub="By category · TB" title="Used vs available storage" />
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={storageCategoryChart} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="used" name="Used" stackId="s1" fill={C.accent} />
                  <Bar dataKey="available" name="Available" stackId="s1" fill="#e2e8f0" stroke={C.border} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
            <Panel className="col-span-6">
              <SectionHead sub="By domain · TB" title="Sensitive data by asset domain" />
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={storageDbChart} layout="vertical" margin={{ top: 5, right: 16, left: 4, bottom: 0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="2 4" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={52} tick={{ fontSize: 10, fill: C.ink }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="used" name="Used" stackId="s2" fill={C.info} barSize={12} />
                  <Bar dataKey="available" name="Available" stackId="s2" fill="#e2e8f0" barSize={12} radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
            <Panel className="col-span-12">
              <SectionHead sub="Regional capacity" title="Storage utilization by region" />
              <div className="space-y-3">
                {filteredStorageByRegion.map((r) => {
                  const pct = r.utilization;
                  const barColor = pct >= 90 ? C.crit : pct >= 80 ? C.warn : C.accent;
                  return (
                    <div key={r.region} className="grid grid-cols-12 items-center gap-3">
                      <div className="col-span-2 text-xs font-medium" style={{ color: C.ink }}>{r.region}</div>
                      <div className="col-span-2 font-mono-num text-[11px]" style={{ color: C.inkSoft }}>
                        {formatStorageTb(r.used)} / {formatStorageTb(r.total)}
                      </div>
                      <div className="col-span-6 flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-sm overflow-hidden" style={{ background: C.panelAlt }}>
                          <div className="h-full" style={{ width: `${pct}%`, background: barColor, borderRadius: 2 }} />
                        </div>
                        <span className="font-mono-num text-xs w-10 text-right" style={{ color: C.ink }}>{pct}%</span>
                      </div>
                      <div className="col-span-2 flex justify-end">
                        <Pill tone={pct >= 90 ? 'crit' : pct >= 80 ? 'warn' : 'ok'}>{formatStorageTb(r.available)} free</Pill>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </>
        )}

        {showInstances && instanceHostType !== 'EOL Compliance' && (
          <>
            <Panel className="col-span-12">
              <SectionHead sub="Host platform comparison" title="VMs vs bare metal · fleet summary" />
              <div className="grid grid-cols-2 gap-4 mb-4">
                {[instances.vms, instances.bareMetal].map((p) => (
                  <div
                    key={p.kind}
                    className="p-4 border rounded"
                    style={{
                      borderColor: instanceHostType === p.kind ? C.accent : C.border,
                      background: instanceHostType === p.kind ? C.accentSoft : C.panelAlt,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      {p.kind === 'VMs' ? <Cloud size={16} style={{ color: C.accent }} /> : <Server size={16} style={{ color: C.accent }} />}
                      <span className="font-display font-semibold text-sm" style={{ color: C.ink }}>{p.kind}</span>
                      {instanceHostType === p.kind && <Pill tone="accent">selected</Pill>}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div><span style={{ color: C.inkMute }}>Hosts</span><div className="font-mono-num font-bold block" style={{ color: C.ink }}>{p.hostCount.toLocaleString()}</div></div>
                      <div><span style={{ color: C.inkMute }}>Assets</span><div className="font-mono-num font-bold block" style={{ color: C.ink }}>{p.dbCount.toLocaleString()}</div></div>
                      <div><span style={{ color: C.inkMute }}>Data used</span><div className="font-mono-num font-bold block" style={{ color: C.ink }}>{formatStorageTb(p.usedStorageTb)}</div></div>
                      <div><span style={{ color: C.inkMute }}>Users</span><div className="font-mono-num font-bold block" style={{ color: C.ink }}>{p.uniqueUsers.toLocaleString()}</div></div>
                      <div><span style={{ color: C.inkMute }}>Sessions</span><div className="font-mono-num font-bold block" style={{ color: C.ink }}>{p.activeSessions.toLocaleString()}</div></div>
                      <div><span style={{ color: C.inkMute }}>vCPU / RAM</span><div className="font-mono-num font-bold block" style={{ color: C.ink }}>{p.vcpuTotal.toLocaleString()} · {p.ramTb} TB</div></div>
                    </div>
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={instances.comparison} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="storage" name="Storage (TB)" fill={C.accent} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="users" name="Users" fill={C.info} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="hosts" name="Hosts" fill="#7c3aed" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel className="col-span-6">
              <SectionHead sub={`${instanceHostType} · storage TB`} title="Used vs available on hosts" />
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={instances.storageComparison} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="used" name="Used" stackId="h1" fill={C.accent} />
                  <Bar dataKey="available" name="Available" stackId="h1" fill="#e2e8f0" stroke={C.border} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel className="col-span-6">
              <SectionHead sub={`${instanceHostType} · users`} title="Users & active sessions" />
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={instances.userComparison} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="users" name="Unique users" fill={C.info} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="sessions" name="Active sessions" fill={C.accent} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel className="col-span-6">
              <SectionHead sub={`${instanceHostType} · identity`} title="Users by role" />
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={instanceProfile.usersByRole} layout="vertical" margin={{ top: 5, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="2 4" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="role" width={100} tick={{ fontSize: 10, fill: C.ink }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 11 }} />
                  <Bar dataKey="count" name="Users" fill={C.accent} barSize={14} radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel className="col-span-6">
              <SectionHead sub={`${instanceHostType} · 7-day`} title="Storage & user trend" />
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={instanceProfile.storageTrend7d} margin={{ top: 5, right: 10, left: -5, bottom: 0 }}>
                  <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} width={44} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line yAxisId="left" type="monotone" dataKey="used" name="Storage (TB)" stroke={C.accent} strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="users" name="Users" stroke={C.info} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>

            <Panel className="col-span-12">
              <SectionHead sub={`${instanceHostType} · by region`} title="Regional host distribution" />
              <div className="space-y-3">
                {filteredInstanceByRegion.map((r) => (
                  <div key={r.region} className="grid grid-cols-12 items-center gap-3 text-xs">
                    <div className="col-span-2 font-medium" style={{ color: C.ink }}>{r.region}</div>
                    <div className="col-span-2 font-mono-num" style={{ color: C.inkSoft }}>{r.hosts} hosts</div>
                    <div className="col-span-2 font-mono-num" style={{ color: C.inkSoft }}>{formatStorageTb(r.storageTb)} data</div>
                    <div className="col-span-2 font-mono-num" style={{ color: C.inkSoft }}>{r.users.toLocaleString()} users</div>
                    <div className="col-span-2 font-mono-num" style={{ color: C.inkSoft }}>{r.databases} assets</div>
                    <div className="col-span-2 flex justify-end">
                      <Pill tone="neutral">{instanceHostType}</Pill>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel className="col-span-12" padding="p-0">
              <div className="px-5 py-3 border-b" style={{ borderColor: C.border }}>
                <SectionHead sub={`${instanceHostType} inventory`} title="Top security asset hosts" />
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {['Hostname', 'Region', 'Domain', 'Assets', 'Data volume', 'Identities', 'Sessions', 'CPU', 'Mem', 'Status'].map((h) => (
                      <th key={h} className="text-left font-medium py-2.5 px-4 text-[10px] uppercase tracking-wider" style={{ color: C.inkMute }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredInstanceHosts.map((h) => (
                    <tr key={h.hostname} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td className="py-2.5 px-4 font-mono-num" style={{ color: C.ink }}>{h.hostname}</td>
                      <td className="py-2.5 px-4" style={{ color: C.inkSoft }}>{h.region}</td>
                      <td className="py-2.5 px-4" style={{ color: C.inkSoft }}>{h.dbType}</td>
                      <td className="py-2.5 px-4 font-mono-num" style={{ color: C.ink }}>{h.databases}</td>
                      <td className="py-2.5 px-4 font-mono-num font-semibold" style={{ color: C.ink }}>{h.storageUsedTb} / {h.storageTotalTb} TB</td>
                      <td className="py-2.5 px-4 font-mono-num" style={{ color: C.ink }}>{h.users}</td>
                      <td className="py-2.5 px-4 font-mono-num" style={{ color: C.inkSoft }}>{h.activeSessions}</td>
                      <td className="py-2.5 px-4 font-mono-num" style={{ color: h.cpuPct > 85 ? C.crit : C.ink }}>{h.cpuPct}%</td>
                      <td className="py-2.5 px-4 font-mono-num" style={{ color: h.memPct > 85 ? C.crit : C.ink }}>{h.memPct}%</td>
                      <td className="py-2.5 px-4"><Pill tone={h.status === 'healthy' ? 'ok' : 'warn'}>{h.status}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </>
        )}

        {showAiRecs && (
          <Panel className="col-span-12">
            <SectionHead sub="Top recommendations" title="Highest-confidence AI actions" />
            <div className="space-y-3">
              {aiRecs.slice(0, 3).map((rec) => (
                <div key={rec.id} className="p-4 border rounded" style={{ borderColor: C.border, background: C.panelAlt }}>
                  <div className="flex items-center gap-2 mb-1">
                    <Sparkles size={12} style={{ color: '#7c3aed' }} />
                    <span className="font-mono-num text-[10px] font-bold" style={{ color: '#7c3aed' }}>{rec.id}</span>
                    <Pill tone={rec.priority === 'P1' ? 'p1' : rec.priority === 'P2' ? 'p2' : 'p3'} size="xs">{rec.priority}</Pill>
                    <span className="font-mono-num text-[10px] ml-auto" style={{ color: C.inkMute }}>{rec.confidence}% confidence</span>
                  </div>
                  <div className="text-sm font-medium" style={{ color: C.ink }}>{rec.title}</div>
                  <div className="text-[11px] mt-1" style={{ color: C.inkSoft }}>{rec.suggestion}</div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {showRegional && (
          <Panel className={showCostCloud ? 'col-span-7' : 'col-span-12'}>
            <SectionHead sub={showCostCloud ? 'Cloud spend by region' : 'Geographic distribution'} title={showCostCloud ? 'Regional cost allocation' : 'Regional health & latency'} />
            <div className="space-y-2.5">
              {filteredRegionHealth.map((r) => (
                <div key={r.region} className="grid grid-cols-12 items-center gap-3 py-1.5">
                  <div className="col-span-3 flex items-center gap-2">
                    <Globe size={12} style={{ color: C.inkMute }} />
                    <span className="text-xs font-medium" style={{ color: C.ink }}>{r.region}</span>
                  </div>
                  <div className="col-span-2 font-mono-num text-xs" style={{ color: C.inkSoft }}>{r.dbs} dbs</div>
                  <div className="col-span-4 flex items-center gap-2">
                    <div className="flex-1 h-1.5" style={{ background: C.panelAlt, borderRadius: 2 }}>
                      <div className="h-full" style={{ width: `${r.health}%`, background: r.health >= 90 ? C.ok : r.health >= 80 ? C.warn : C.crit, borderRadius: 2 }} />
                    </div>
                    <span className="font-mono-num text-xs w-8 text-right" style={{ color: C.ink }}>{showCostCloud ? `$${Math.round(r.dbs * 4.2)}K` : `${r.health}%`}</span>
                  </div>
                  <div className="col-span-3 flex justify-end">
                    {showCostCloud ? (
                      <Pill tone="neutral">{((r.dbs / totals.totalDbs) * 100).toFixed(1)}% spend</Pill>
                    ) : r.incidents > 0 ? (
                      <Pill tone={r.incidents > 8 ? 'crit' : 'warn'}>{r.incidents} active</Pill>
                    ) : (
                      <Pill tone="ok">clear</Pill>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {showCostCloud && (
          <Panel className="col-span-5">
            <SectionHead sub="Cost breakdown · MTD" title={`${formatSpend(onPremCost.cloudSpend)} cloud spend`} action={<Pill tone="warn">+{metrics.forecastDelta}% vs forecast</Pill>} />
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie data={cloudCostBreakdown} dataKey="value" innerRadius={45} outerRadius={70} paddingAngle={2}>
                  {cloudCostBreakdown.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 11 }} formatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-1">
              {cloudCostBreakdown.map((c) => (
                <div key={c.name} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5" style={{ background: c.color }} /><span style={{ color: C.inkSoft }}>{c.name}</span></div>
                  <span className="font-mono-num font-semibold" style={{ color: C.ink }}>${(c.value / 1000).toFixed(0)}K</span>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {showCostCloud && <CostOptimizationPanel recommendations={cspOptimizations} />}

        {showCostOnPrem && <OnPremCostSection onPrem={onPremCost} />}

        {showHeatmap && (
          <Panel className="col-span-12">
            <SectionHead
              sub={tab === 'Security' ? 'Security risk heatmap' : 'Risk heatmap'}
              title={tab === 'Security' ? 'Threat exposure by domain × region' : 'Asset domain × region exposure'}
            />
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-[11px]">
                <thead>
                  <tr>
                    <th className="text-left font-medium pb-2 pr-4" style={{ color: C.inkMute }}>DB / Region</th>
                    {heatmapRegions.map((r) => (
                      <th key={r} className="font-medium pb-2 px-1 text-center" style={{ color: C.inkMute }}>{r.split('-')[0]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredHeatmap.map((row) => (
                    <tr key={row.type}>
                      <td className="py-1 pr-4 font-medium" style={{ color: C.ink }}>{row.type}</td>
                      {row.cells.map((cell) => {
                        const v = cell.v;
                        const bg = v < 20 ? '#dcfce7' : v < 40 ? '#fef9c3' : v < 60 ? '#fed7aa' : v < 80 ? '#fecaca' : '#fca5a5';
                        return (
                          <td key={cell.region} className="p-0.5">
                            <div className="h-7 flex items-center justify-center font-mono-num font-semibold" style={{ background: bg, color: v < 60 ? '#334155' : '#991b1b', borderRadius: 2 }}>{v}</div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {tab === 'Security' && !showHeatmap && null}
      </div>
    </div>
  );
}
