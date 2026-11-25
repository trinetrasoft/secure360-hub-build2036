import React, { useMemo } from 'react';
import {
  BarChart, Bar, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { HardDrive, TrendingUp, AlertTriangle, Archive } from 'lucide-react';
import Panel from '../components/ui/Panel';
import Pill from '../components/ui/Pill';
import Kpi from '../components/ui/Kpi';
import SectionHead from '../components/ui/SectionHead';
import { C } from '../theme/colors';
import { ALL_ENVS } from '../mock-data/envScope';
import { getStorageForEnv, formatStorageTb } from '../mock-data/storage';
import StoragePlatformSection from '../components/storage/StoragePlatformSection';

const tooltipStyle = {
  background: C.panel,
  border: `1px solid ${C.border}`,
  borderRadius: 3,
  fontSize: 11,
};

function UtilBar({ used, total, height = 8 }) {
  const pct = total > 0 ? (used / total) * 100 : 0;
  const tone = pct >= 90 ? C.crit : pct >= 80 ? C.warn : C.accent;
  return (
    <div className="flex-1 h-2 rounded-sm overflow-hidden" style={{ background: C.panelAlt, height }}>
      <div className="h-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: tone, borderRadius: 2 }} />
    </div>
  );
}

export default function StorageDashboard({ env = ALL_ENVS }) {
  const storage = useMemo(() => getStorageForEnv(env), [env]);
  const utilTone = storage.utilizationPct >= 90 ? 'crit' : storage.utilizationPct >= 80 ? 'warn' : 'ok';

  const categoryChart = storage.byCategory.map((c) => ({
    name: c.name.split(' ')[0],
    fullName: c.name,
    used: c.used,
    available: c.available,
    total: c.total,
  }));

  const dbTypeChart = storage.byDbType.map((d) => ({
    name: d.type.split(' ')[0],
    fullName: d.type,
    used: d.used,
    available: d.available,
  }));

  return (
    <div className="space-y-5">
      <div className="azure-commandbar flex items-end justify-between px-5 py-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-1" style={{ color: C.inkMute }}>
            Data Governance · {env}
          </div>
          <h1 className="font-display text-2xl font-semibold" style={{ color: C.ink }}>
            Sensitive data & classification posture
          </h1>
          <div className="text-xs mt-1" style={{ color: C.inkSoft }}>
            {formatStorageTb(storage.usedTb)} used of {formatStorageTb(storage.totalTb)} provisioned · +{storage.growthPct30d}% growth (30d)
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone={utilTone}>{storage.utilizationPct}% utilized</Pill>
          <Pill tone="neutral">Azure-inspired data estate view</Pill>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3">
          <Kpi label="Total capacity" value={formatStorageTb(storage.totalTb)} icon={HardDrive} />
        </div>
        <div className="col-span-3">
          <Kpi label="Classified data" value={formatStorageTb(storage.usedTb)} tone="warn" delta={storage.growthPct30d} icon={HardDrive} />
        </div>
        <div className="col-span-3">
          <Kpi label="Available" value={formatStorageTb(storage.availableTb)} tone="ok" icon={Archive} />
        </div>
        <div className="col-span-3">
          <Kpi label="Utilization" value={String(storage.utilizationPct)} unit="%" tone={utilTone} icon={TrendingUp} />
        </div>
      </div>

      <StoragePlatformSection storage={storage} />

      <div className="grid grid-cols-12 gap-4">
        <Panel className="col-span-8">
          <SectionHead
            sub="30-day capacity trend"
            title="Used vs provisioned storage"
            action={
              <span className="text-[10px] font-mono-num uppercase tracking-wider" style={{ color: C.inkMute }}>
                TB
              </span>
            }
          />
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={storage.trend30d} margin={{ top: 5, right: 10, left: -5, bottom: 0 }}>
              <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} interval={4} />
              <YAxis tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} width={48} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} TB`, '']} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="provisioned" name="Provisioned" stroke={C.inkMute} strokeWidth={1.4} strokeDasharray="4 4" dot={false} />
              <Line type="monotone" dataKey="used" name="Used" stroke={C.accent} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel className="col-span-4">
          <SectionHead sub="Capacity snapshot" title="Used vs available" />
          <div className="flex flex-col items-center justify-center py-6">
            <div
              className="relative w-36 h-36 rounded-full flex items-center justify-center"
              style={{
                background: `conic-gradient(${C.accent} 0% ${storage.utilizationPct}%, ${C.panelAlt} ${storage.utilizationPct}% 100%)`,
              }}
            >
              <div
                className="w-24 h-24 rounded-full flex flex-col items-center justify-center"
                style={{ background: C.panel }}
              >
                <span className="font-mono-num text-2xl font-bold" style={{ color: C.ink }}>
                  {storage.utilizationPct}%
                </span>
                <span className="text-[9px] uppercase tracking-wider" style={{ color: C.inkMute }}>
                  used
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-6 w-full text-center text-xs">
              <div>
                <div className="font-mono-num font-bold text-sm" style={{ color: C.accent }}>{formatStorageTb(storage.usedTb)}</div>
                <div style={{ color: C.inkMute }}>Used</div>
              </div>
              <div>
                <div className="font-mono-num font-bold text-sm" style={{ color: C.ok }}>{formatStorageTb(storage.availableTb)}</div>
                <div style={{ color: C.inkMute }}>Free</div>
              </div>
            </div>
          </div>
        </Panel>

        <Panel className="col-span-6">
          <SectionHead sub="By storage category" title="Used vs available (TB)" />
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={categoryChart} margin={{ top: 5, right: 10, left: -10, bottom: 0 }} barCategoryGap="20%">
              <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} width={40} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="used" name="Used" stackId="a" fill={C.accent} radius={[0, 0, 0, 0]} />
              <Bar dataKey="available" name="Available" stackId="a" fill={C.panelAlt} stroke={C.border} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel className="col-span-6">
          <SectionHead sub="By asset domain" title="Classified data by domain" />
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={dbTypeChart} layout="vertical" margin={{ top: 5, right: 20, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={C.border} strokeDasharray="2 4" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={56} tick={{ fontSize: 10, fill: C.ink }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="used" name="Used" stackId="b" fill={C.info} barSize={14} />
              <Bar dataKey="available" name="Available" stackId="b" fill="#e2e8f0" barSize={14} radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel className="col-span-12">
          <SectionHead sub="Regional breakdown" title="Storage by geography" />
          <div className="space-y-3">
            {storage.byRegion.map((r) => (
              <div key={r.region} className="grid grid-cols-12 items-center gap-3">
                <div className="col-span-2 text-xs font-medium" style={{ color: C.ink }}>{r.region}</div>
                <div className="col-span-2 font-mono-num text-xs" style={{ color: C.inkSoft }}>
                  {formatStorageTb(r.used)} / {formatStorageTb(r.total)}
                </div>
                <div className="col-span-6 flex items-center gap-2">
                  <UtilBar used={r.used} total={r.total} />
                  <span className="font-mono-num text-xs w-10 text-right" style={{ color: C.ink }}>{r.utilization}%</span>
                </div>
                <div className="col-span-2 flex justify-end">
                  <Pill tone={r.utilization >= 90 ? 'crit' : r.utilization >= 80 ? 'warn' : 'ok'}>
                    {formatStorageTb(r.available)} free
                  </Pill>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="col-span-12" padding="p-0">
          <div className="px-5 py-3 border-b" style={{ borderColor: C.border }}>
            <SectionHead sub="Top consumers" title="Data stores approaching policy limits" />
          </div>
          <table className="azure-table w-full text-xs">
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Data store', 'Domain', 'Region', 'Used', 'Provisioned', 'Utilization', '7d growth', ''].map((h) => (
                  <th key={h} className="text-left font-medium py-2.5 px-4 text-[10px] uppercase tracking-wider" style={{ color: C.inkMute }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {storage.topConsumers.map((row) => (
                <tr key={row.db} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td className="py-2.5 px-4 font-mono-num" style={{ color: C.ink }}>{row.db}</td>
                  <td className="py-2.5 px-4" style={{ color: C.inkSoft }}>{row.dbType}</td>
                  <td className="py-2.5 px-4" style={{ color: C.inkSoft }}>{row.region}</td>
                  <td className="py-2.5 px-4 font-mono-num font-semibold" style={{ color: C.ink }}>{row.usedTb} TB</td>
                  <td className="py-2.5 px-4 font-mono-num" style={{ color: C.inkMute }}>{row.totalTb} TB</td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2 max-w-[120px]">
                      <UtilBar used={row.usedTb} total={row.totalTb} height={6} />
                      <span className="font-mono-num font-semibold" style={{ color: row.utilization >= 90 ? C.crit : C.ink }}>
                        {row.utilization}%
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 font-mono-num" style={{ color: row.growth7d > 3 ? C.crit : C.inkSoft }}>
                    {row.growth7d > 0 ? '+' : ''}{row.growth7d}%
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    {row.utilization >= 85 && (
                      <AlertTriangle size={14} style={{ color: C.warn }} className="inline" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}
