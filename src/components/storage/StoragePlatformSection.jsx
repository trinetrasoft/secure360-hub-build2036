import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { HardDrive, Server, FolderOpen, Database } from 'lucide-react';
import Panel from '../ui/Panel';
import Pill from '../ui/Pill';
import Kpi from '../ui/Kpi';
import TabBar from '../ui/TabBar';
import SectionHead from '../ui/SectionHead';
import { C } from '../../theme/colors';
import {
  STORAGE_PLATFORM_TYPES,
  formatStorageTb,
  getPlatformStorage,
} from '../../mock-data/storage';

const PLATFORM_VIEWS = ['Overview', ...STORAGE_PLATFORM_TYPES];

const PLATFORM_ICONS = {
  SAN: Server,
  NFS: FolderOpen,
  NAS: HardDrive,
};

const tooltipStyle = {
  background: C.panel,
  border: `1px solid ${C.border}`,
  borderRadius: 3,
  fontSize: 11,
};

function PlatformCard({ platform, active, onSelect }) {
  const Icon = PLATFORM_ICONS[platform.type] || HardDrive;
  const utilTone = platform.utilizationPct >= 90 ? 'crit' : platform.utilizationPct >= 80 ? 'warn' : 'ok';

  return (
    <button
      type="button"
      onClick={() => onSelect(platform.type)}
      className="text-left p-4 border rounded transition-all w-full"
      style={{
        borderColor: active ? platform.color : C.border,
        borderLeftWidth: 3,
        borderLeftColor: platform.color,
        background: active ? C.accentSoft : C.panelAlt,
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} style={{ color: platform.color }} />
        <span className="font-display font-semibold text-sm" style={{ color: C.ink }}>{platform.label}</span>
        <Pill tone={utilTone} size="xs">{platform.utilizationPct}%</Pill>
      </div>
      <p className="text-[10px] mb-3" style={{ color: C.inkMute }}>{platform.subtitle}</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="font-mono-num text-sm font-bold" style={{ color: C.ink }}>{formatStorageTb(platform.totalTb)}</div>
          <div className="text-[9px] uppercase tracking-wider" style={{ color: C.inkMute }}>Total</div>
        </div>
        <div>
          <div className="font-mono-num text-sm font-bold" style={{ color: C.warn }}>{formatStorageTb(platform.usedTb)}</div>
          <div className="text-[9px] uppercase tracking-wider" style={{ color: C.inkMute }}>Used</div>
        </div>
        <div>
          <div className="font-mono-num text-sm font-bold" style={{ color: C.ok }}>{formatStorageTb(platform.freeTb)}</div>
          <div className="text-[9px] uppercase tracking-wider" style={{ color: C.inkMute }}>Free</div>
        </div>
      </div>
    </button>
  );
}

function PlatformDetail({ platform }) {
  const chartData = platform.volumes.map((v) => ({
    name: v.name.split('-').slice(-2).join('-'),
    used: v.usedTb,
    free: v.freeTb,
  }));

  const pieData = [
    { name: 'Used', value: platform.usedTb },
    { name: 'Free', value: platform.freeTb },
  ];

  return (
    <>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3">
          <Kpi label="Total capacity" value={formatStorageTb(platform.totalTb)} icon={PLATFORM_ICONS[platform.type]} />
        </div>
        <div className="col-span-3">
          <Kpi label="Used capacity" value={formatStorageTb(platform.usedTb)} tone="warn" icon={Database} />
        </div>
        <div className="col-span-3">
          <Kpi label="Free space" value={formatStorageTb(platform.freeTb)} tone="ok" icon={HardDrive} />
        </div>
        <div className="col-span-3">
          <Kpi label={platform.type === 'SAN' ? 'LUNs / arrays' : 'Shares'} value={String(platform.volumes.length)} unit={`of ${platform.arrays}`} />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Panel className="col-span-5">
          <SectionHead sub={`${platform.label} capacity`} title="Used vs free space" />
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} dataKey="value" innerRadius={55} outerRadius={80} paddingAngle={2}>
                <Cell fill={platform.color} />
                <Cell fill="#e2e8f0" />
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v} TB`} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 text-xs mt-2">
            <span style={{ color: C.inkSoft }}><span className="inline-block w-2 h-2 mr-1" style={{ background: platform.color }} />Used {formatStorageTb(platform.usedTb)}</span>
            <span style={{ color: C.inkSoft }}><span className="inline-block w-2 h-2 mr-1 bg-slate-200" />Free {formatStorageTb(platform.freeTb)}</span>
          </div>
        </Panel>
        <Panel className="col-span-7">
          <SectionHead sub="Per volume · TB" title={`${platform.label} volume utilization`} />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: C.inkMute }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} width={36} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="used" name="Used" stackId="p" fill={platform.color} />
              <Bar dataKey="free" name="Free" stackId="p" fill="#e2e8f0" stroke={C.border} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel padding="p-0" className="overflow-hidden">
        <div className="px-5 py-3 border-b" style={{ borderColor: C.border }}>
          <SectionHead sub={`${platform.label} inventory`} title="Volumes & shares" />
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="azure-table w-full text-xs">
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Name', 'Region', 'Protocol', 'Total', 'Used', 'Free', 'Utilization'].map((h) => (
                  <th key={h} className="text-left font-medium py-2.5 px-4 text-[10px] uppercase tracking-wider" style={{ color: C.inkMute }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {platform.volumes.map((v) => (
                <tr key={v.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td className="py-2.5 px-4 font-mono-num" style={{ color: C.ink }}>{v.name}</td>
                  <td className="py-2.5 px-4" style={{ color: C.inkSoft }}>{v.region}</td>
                  <td className="py-2.5 px-4"><Pill tone="neutral">{v.protocol}</Pill></td>
                  <td className="py-2.5 px-4 font-mono-num" style={{ color: C.ink }}>{v.totalTb} TB</td>
                  <td className="py-2.5 px-4 font-mono-num font-semibold" style={{ color: C.warn }}>{v.usedTb} TB</td>
                  <td className="py-2.5 px-4 font-mono-num" style={{ color: C.ok }}>{v.freeTb} TB</td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2 max-w-[100px]">
                      <div className="flex-1 h-1.5 rounded-sm overflow-hidden" style={{ background: C.panelAlt }}>
                        <div className="h-full" style={{ width: `${v.utilization}%`, background: platform.color, borderRadius: 2 }} />
                      </div>
                      <span className="font-mono-num font-semibold">{v.utilization}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

export default function StoragePlatformSection({ storage }) {
  const [view, setView] = useState('Overview');

  const platformChart = useMemo(
    () =>
      storage.byPlatform.map((p) => ({
        name: p.type,
        used: p.usedTb,
        free: p.freeTb,
        total: p.totalTb,
      })),
    [storage.byPlatform]
  );

  const activePlatform = view === 'Overview' ? null : getPlatformStorage(storage, view);

  return (
    <div className="col-span-12 space-y-4">
      <Panel className="col-span-12">
        <SectionHead
          sub="Shared storage platforms"
          title="Storage platform capacity dashboard"
          action={
            <span className="text-[10px] font-mono-num uppercase tracking-wider" style={{ color: C.inkMute }}>
              {formatStorageTb(storage.platformTotals.usedTb)} used / {formatStorageTb(storage.platformTotals.totalTb)} total
            </span>
          }
        />
        <TabBar tabs={PLATFORM_VIEWS} active={view} onChange={setView} />

        {view === 'Overview' && (
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-3 gap-4">
              {storage.byPlatform.map((p) => (
                <PlatformCard
                  key={p.type}
                  platform={p}
                  active={false}
                  onSelect={setView}
                />
              ))}
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={platformChart} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.inkMute }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} width={44} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="used" name="Used (TB)" stackId="plat" fill={C.accent} />
                <Bar dataKey="free" name="Free (TB)" stackId="plat" fill="#e2e8f0" stroke={C.border} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-3 gap-3 text-[11px]">
              {storage.byPlatform.map((p) => (
                <div key={p.type} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: C.panelAlt }}>
                  <span className="w-2 h-2 rounded-sm" style={{ background: p.color }} />
                  <span style={{ color: C.inkSoft }}>{p.label}: {formatStorageTb(p.freeTb)} free</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activePlatform && <PlatformDetail platform={activePlatform} />}
      </Panel>
    </div>
  );
}
