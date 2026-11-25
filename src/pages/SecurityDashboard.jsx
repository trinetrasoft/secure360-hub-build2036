import React, { useState, useMemo } from 'react';
import { ALL_ENVS, getComplianceForEnv } from '../mock-data/envScope';
import {
  LineChart, Line, BarChart, Bar, RadialBarChart, RadialBar,
  CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { Shield, Flame, Lock, ShieldCheck } from 'lucide-react';
import Panel from '../components/ui/Panel';
import Pill from '../components/ui/Pill';
import Kpi from '../components/ui/Kpi';
import TabBar from '../components/ui/TabBar';
import SectionHead from '../components/ui/SectionHead';
import { C } from '../theme/colors';
import {
  COMPLIANCE,
  COMPLIANCE_TREND,
  FRAMEWORK_TAB_MAP,
  VULN_BY_FRAMEWORK,
  FAILED_CONTROLS_SAMPLE,
} from '../mock-data/compliance';

const FRAMEWORK_TABS = Object.keys(FRAMEWORK_TAB_MAP);

export default function SecurityDashboard({ env = ALL_ENVS }) {
  const [tab, setTab] = useState('CIS');
  const mapping = FRAMEWORK_TAB_MAP[tab];
  const complianceData = useMemo(() => getComplianceForEnv(env, COMPLIANCE), [env]);
  const framework = useMemo(
    () => complianceData.find((c) => c.framework === mapping.framework) || complianceData[0],
    [complianceData, mapping.framework]
  );
  const vulnData = VULN_BY_FRAMEWORK[tab] || VULN_BY_FRAMEWORK.CIS;
  const failedControls = FAILED_CONTROLS_SAMPLE[tab] || [];
  const trendKey = mapping.trendKey;
  const trendColor =
    trendKey === 'cis' ? C.accent : trendKey === 'iso' ? C.info : trendKey === 'pci' ? '#7c3aed' : C.warn;

  const totalVulns = vulnData.reduce((s, v) => s + v.count, 0);

  return (
    <div className="space-y-5">
      <div className="azure-commandbar flex items-end justify-between px-5 py-4">
        <div>
        <div className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-1" style={{ color: C.inkMute }}>
          Vulnerability Management · {tab} · {env}
        </div>
        <h1 className="font-display text-2xl font-semibold" style={{ color: C.ink }}>
          {framework.framework} continuous compliance
        </h1>
          <div className="text-xs mt-1" style={{ color: C.inkSoft }}>
            Command surface for policy status, vulnerability exposure, and framework comparison.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone="accent">Continuous scan</Pill>
          <Pill tone="neutral">Compliance workspace</Pill>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3"><Kpi label="Framework Score" value={framework.score} unit="/100" tone={framework.score >= 90 ? 'ok' : framework.score >= 80 ? 'warn' : 'crit'} delta={framework.trend} icon={Shield} /></div>
        <div className="col-span-3"><Kpi label="Failed Controls" value={framework.failed} tone="crit" icon={Flame} /></div>
        <div className="col-span-3"><Kpi label="Findings (framework)" value={totalVulns} tone="warn" icon={Lock} /></div>
        <div className="col-span-3"><Kpi label="Pass Rate" value={Math.round((framework.passed / framework.total) * 100)} unit="%" tone="ok" icon={ShieldCheck} /></div>
      </div>

      <TabBar tabs={FRAMEWORK_TABS} active={tab} onChange={setTab} />

      <div className="grid grid-cols-12 gap-4">
        <Panel className="col-span-4">
          <SectionHead sub={framework.framework} title="Posture score" />
          <div className="flex flex-col items-center py-4">
            <ResponsiveContainer width="100%" height={180}>
              <RadialBarChart innerRadius="65%" outerRadius="100%" data={[{ value: framework.score, fill: framework.score >= 90 ? C.ok : framework.score >= 80 ? C.warn : C.crit }]} startAngle={90} endAngle={-270}>
                <RadialBar background={{ fill: C.panelAlt }} dataKey="value" cornerRadius={2} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="-mt-32 text-center mb-12">
              <div className="font-mono-num text-4xl font-bold" style={{ color: C.ink }}>{framework.score}</div>
              <div className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: C.inkMute }}>of 100</div>
            </div>
            <div className="flex items-center gap-4 text-xs w-full justify-center mt-2">
              <div className="text-center"><div className="font-mono-num font-bold" style={{ color: C.ok }}>{framework.passed}</div><div className="text-[10px] uppercase tracking-wider" style={{ color: C.inkMute }}>Passed</div></div>
              <div className="w-px h-8" style={{ background: C.border }} />
              <div className="text-center"><div className="font-mono-num font-bold" style={{ color: C.crit }}>{framework.failed}</div><div className="text-[10px] uppercase tracking-wider" style={{ color: C.inkMute }}>Failed</div></div>
              <div className="w-px h-8" style={{ background: C.border }} />
              <div className="text-center"><div className="font-mono-num font-bold" style={{ color: C.ink }}>{framework.total}</div><div className="text-[10px] uppercase tracking-wider" style={{ color: C.inkMute }}>Controls</div></div>
            </div>
          </div>
        </Panel>

        <Panel className="col-span-8">
          <SectionHead sub="12-month trend" title={`${framework.framework} score over time`} />
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={COMPLIANCE_TREND} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="m" tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} />
              <YAxis domain={[70, 100]} tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} width={32} />
              <Tooltip contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 11 }} />
              <Line type="monotone" dataKey={trendKey} stroke={trendColor} strokeWidth={2.2} dot={{ r: 3, fill: trendColor }} name={framework.framework} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel className="col-span-7">
          <SectionHead sub={`${tab} findings`} title={`${totalVulns} vulnerabilities by severity`} />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={vulnData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }} layout="vertical">
              <CartesianGrid stroke={C.border} strokeDasharray="2 4" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="severity" tick={{ fontSize: 11, fill: C.inkSoft }} axisLine={false} tickLine={false} width={70} />
              <Tooltip contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 11 }} />
              <Bar dataKey="count" radius={[0, 2, 2, 0]}>{vulnData.map((e, i) => <Cell key={i} fill={e.color} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel className="col-span-5">
          <SectionHead sub="Open gaps" title="Top failing controls" />
          <ul className="space-y-2.5">
            {failedControls.map((ctrl) => (
              <li key={ctrl} className="text-[12px] py-2 border-b flex gap-2" style={{ borderColor: C.border, color: C.inkSoft }}>
                <Pill tone="crit" size="xs">FAIL</Pill>
                <span style={{ color: C.ink }}>{ctrl}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel className="col-span-12">
          <SectionHead sub="All frameworks" title="Compare scores (selected highlighted)" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {COMPLIANCE.map((c) => {
              const isActive = c.framework === framework.framework;
              return (
                <div
                  key={c.framework}
                  className="p-3 border"
                  style={{
                    borderColor: isActive ? C.accent : C.border,
                    background: isActive ? C.accentSoft : C.panel,
                    borderRadius: 8,
                    borderWidth: isActive ? 2 : 1,
                  }}
                >
                  <div className="text-xs font-medium" style={{ color: C.ink }}>{c.framework}</div>
                  <div className="font-mono-num text-2xl font-bold mt-1" style={{ color: isActive ? C.accent : C.ink }}>{c.score}</div>
                  <div className="text-[10px] font-mono-num" style={{ color: C.inkMute }}>{c.passed}/{c.total} passing</div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}
