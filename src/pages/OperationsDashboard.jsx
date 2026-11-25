import React, { useState, useMemo } from 'react';
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Shield, CheckCircle2, AlertTriangle, Flame, Terminal,
} from 'lucide-react';
import Panel from '../components/ui/Panel';
import Pill from '../components/ui/Pill';
import Kpi from '../components/ui/Kpi';
import TabBar from '../components/ui/TabBar';
import SectionHead from '../components/ui/SectionHead';
import { C } from '../theme/colors';
import {
  getPerfForDbType,
  getSlowQueriesForDbType,
  getOpsMetricsForDbType,
} from '../mock-data/operations';
import { SECURITY_DOMAINS } from '../mock-data/helpers';
import { ALL_ENVS, getInventoryForEnv, envSalt, getEnvSlug } from '../mock-data/envScope';

export default function OperationsDashboard({ env = ALL_ENVS }) {
  const [tab, setTab] = useState('Cloud');
  const inventory = useMemo(() => getInventoryForEnv(env), [env]);
  const salt = useMemo(() => envSalt(env), [env]);
  const stats = inventory.find((i) => i.name === tab) || inventory[0];
  const perfData = useMemo(() => getPerfForDbType(tab, salt), [tab, salt]);
  const threatEvents = useMemo(() => {
    const slug = getEnvSlug(env);
    return getSlowQueriesForDbType(tab, slug ? { slug } : null);
  }, [tab, env]);
  const opsMetrics = useMemo(() => getOpsMetricsForDbType(tab, salt), [tab, salt]);

  return (
    <div className="space-y-5">
      <div className="azure-commandbar flex items-end justify-between px-5 py-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-1" style={{ color: C.inkMute }}>
            Threat Detection · {tab} · {env}
          </div>
          <h1 className="font-display text-2xl font-semibold" style={{ color: C.ink }}>
            {tab} security telemetry
          </h1>
          <div className="text-xs mt-1" style={{ color: C.inkSoft }}>
            Azure-style threat operations workspace for live events, posture drift, and detection analysis.
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <Pill tone="info">Live stream</Pill>
          <Pill tone="neutral">SIEM 5s refresh</Pill>
        </div>
      </div>

      <TabBar tabs={SECURITY_DOMAINS} active={tab} onChange={setTab} />

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3"><Kpi label={`${tab} Assets`} value={stats.count} icon={Shield} /></div>
        <div className="col-span-3"><Kpi label="Secure" value={stats.healthy} tone="ok" icon={CheckCircle2} /></div>
        <div className="col-span-3"><Kpi label="At Risk" value={stats.warning} tone="warn" icon={AlertTriangle} /></div>
        <div className="col-span-3"><Kpi label="Critical" value={stats.critical} tone="crit" icon={Flame} /></div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Panel className="col-span-8">
          <SectionHead sub="24h rolling" title="Alert & event velocity" />
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={perfData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="h" tick={{ fontSize: 10, fill: C.inkMute }} />
              <YAxis tick={{ fontSize: 10, fill: C.inkMute }} />
              <Tooltip contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, fontSize: 11 }} />
              <Line type="monotone" dataKey="alerts" stroke={C.crit} strokeWidth={2} dot={false} name="Alerts" />
              <Line type="monotone" dataKey="events" stroke={C.accent} strokeWidth={2} dot={false} name="Events" />
              <Line type="monotone" dataKey="blocked" stroke={C.ok} strokeWidth={1.5} dot={false} name="Blocked" />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel className="col-span-4">
          <SectionHead sub="Live SOC metrics" title="Domain posture" />
          <div className="space-y-2.5">
            {opsMetrics.map((m) => (
              <div key={m.l} className="flex items-center justify-between text-[12px] py-1.5 border-b" style={{ borderColor: C.border }}>
                <span style={{ color: C.inkSoft }}>{m.l}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono-num font-semibold" style={{ color: m.critical ? C.crit : C.ink }}>{m.v}</span>
                  <Pill tone={m.critical ? 'crit' : 'neutral'}>{m.delta}</Pill>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel padding="p-0">
        <SectionHead
          sub="High-severity · ranked by impact"
          title="Top threat events"
          action={<Pill tone="accent"><Terminal size={11} className="inline mr-1" />SOC queue</Pill>}
        />
        <table className="azure-table w-full text-sm">
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.panelAlt }}>
              {['Event ID', 'Asset', 'Count', 'Avg MTTD', 'P99', 'Classification', 'Source'].map((h) => (
                <th key={h} className="text-left font-semibold text-[10px] uppercase tracking-wider py-3 px-4" style={{ color: C.inkMute }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {threatEvents.map((q) => (
              <tr key={q.hash} className="hover:bg-slate-50" style={{ borderBottom: `1px solid ${C.border}` }}>
                <td className="py-2.5 px-4 font-mono-num text-[11px]" style={{ color: C.accent }}>{q.hash}</td>
                <td className="py-2.5 px-4 font-mono-num" style={{ color: C.ink }}>{q.db}</td>
                <td className="py-2.5 px-4 font-mono-num" style={{ color: C.inkSoft }}>{q.exec}</td>
                <td className="py-2.5 px-4 font-mono-num" style={{ color: C.inkSoft }}>{q.avgMs}ms</td>
                <td className="py-2.5 px-4 font-mono-num" style={{ color: C.inkSoft }}>{q.p99}ms</td>
                <td className="py-2.5 px-4"><Pill tone="warn">{q.plan}</Pill></td>
                <td className="py-2.5 px-4 text-[12px]" style={{ color: C.inkSoft }}>{q.user}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
