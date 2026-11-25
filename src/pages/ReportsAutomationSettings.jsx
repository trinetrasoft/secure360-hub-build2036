import React, { useState } from 'react';
import { FileText, Download, PlayCircle, Users, Settings as SettingsIcon } from 'lucide-react';
import Panel from '../components/ui/Panel';
import Pill from '../components/ui/Pill';
import TabBar from '../components/ui/TabBar';
import SectionHead from '../components/ui/SectionHead';
import { C } from '../theme/colors';
import { CONNECTORS } from '../mock-data/connectors';

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
const REPORTS = [
  { name: 'Security Command Weekly Summary',    cat: 'Executive',   last: 'Today 09:00', size: '2.4 MB', fmt: 'PDF' },
  { name: 'Governance & Compliance — Q2',       cat: 'Governance',  last: 'Yesterday',   size: '4.1 MB', fmt: 'PDF' },
  { name: 'Incident Response Trends — 30d',     cat: 'Incidents',   last: '2 days ago',  size: '1.2 MB', fmt: 'PDF' },
  { name: 'Data Classification Posture',        cat: 'Data Gov',    last: '3 days ago',  size: '3.7 MB', fmt: 'XLSX' },
  { name: 'Vulnerability Audit — CIS Benchmark',  cat: 'Security',    last: 'Last week',   size: '6.2 MB', fmt: 'PDF' },
  { name: 'Threat Detection Scorecard',         cat: 'SOC',         last: 'Last week',   size: '1.9 MB', fmt: 'PDF' },
  { name: 'Security Program Spend — MTD',       cat: 'Risk',        last: 'Today 06:00', size: '892 KB', fmt: 'XLSX' },
  { name: 'AI Security Remediation Performance', cat: 'AI Security', last: 'Yesterday',   size: '1.4 MB', fmt: 'PDF' },
];

export function ReportsPage() {
  return (
    <div className="space-y-5">
      <div className="azure-commandbar flex items-end justify-between px-5 py-4">
        <div>
        <div className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-1" style={{ color: C.inkMute }}>
          Reporting Module
        </div>
        <h1 className="font-display text-2xl font-semibold" style={{ color: C.ink }}>
          Generated reports & exports
        </h1>
        </div>
        <Pill tone="neutral">Scheduled exports enabled</Pill>
      </div>

      <Panel padding="p-0">
        <table className="azure-table w-full text-sm">
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.panelAlt }}>
              {['Report', 'Category', 'Last generated', 'Format', 'Size', ''].map((h) => (
                <th
                  key={h}
                  className="text-left font-semibold text-[10px] uppercase tracking-wider py-3 px-5"
                  style={{ color: C.inkMute }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {REPORTS.map((r) => (
              <tr
                key={r.name}
                className="hover:bg-slate-50 transition-colors"
                style={{ borderBottom: `1px solid ${C.border}` }}
              >
                <td className="py-3 px-5">
                  <div className="flex items-center gap-3">
                    <FileText size={14} style={{ color: C.inkMute }} />
                    <span className="font-medium" style={{ color: C.ink }}>{r.name}</span>
                  </div>
                </td>
                <td className="py-3 px-5"><Pill>{r.cat}</Pill></td>
                <td className="py-3 px-5 text-[12px] font-mono-num" style={{ color: C.inkSoft }}>{r.last}</td>
                <td className="py-3 px-5 text-[12px] font-mono-num font-semibold" style={{ color: C.ink }}>{r.fmt}</td>
                <td className="py-3 px-5 text-[12px] font-mono-num" style={{ color: C.inkSoft }}>{r.size}</td>
                <td className="py-3 px-5 text-right">
                  <button
                    className="text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1 ml-auto"
                    style={{ color: C.accent }}
                  >
                    <Download size={11} /> Download
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Automation
// ---------------------------------------------------------------------------
const PLAYBOOKS = [
  { name: 'Auto-throttle parallel queries', triggers: 142, success: 96,  lastRun: '4m ago' },
  { name: 'Kill long-running transactions', triggers: 89,  success: 100, lastRun: '12m ago' },
  { name: 'Remediate non-compliant policies', triggers: 34,  success: 91,  lastRun: '47m ago' },
  { name: 'Rebalance MongoDB shards',       triggers: 12,  success: 100, lastRun: '2h ago' },
  { name: 'Online index rebuild scheduler', triggers: 28,  success: 89,  lastRun: '3h ago' },
  { name: 'Failover orchestration',         triggers: 4,   success: 100, lastRun: 'Yesterday' },
];

export function AutomationPage() {
  return (
    <div className="space-y-5">
      <div className="azure-commandbar flex items-end justify-between px-5 py-4">
        <div>
        <div className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-1" style={{ color: C.inkMute }}>
          Automation & Runbooks
        </div>
        <h1 className="font-display text-2xl font-semibold" style={{ color: C.ink }}>
          Self-healing playbooks
        </h1>
        </div>
        <Pill tone="accent">Automation active</Pill>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {PLAYBOOKS.map((p) => (
          <Panel key={p.name}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-display font-semibold text-sm" style={{ color: C.ink }}>{p.name}</div>
                <div className="text-[11px] font-mono-num mt-0.5" style={{ color: C.inkMute }}>
                  Last run · {p.lastRun}
                </div>
              </div>
              <button className="p-2" style={{ background: C.accentSoft, borderRadius: 3 }}>
                <PlayCircle size={14} style={{ color: C.accent }} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 text-[10px]" style={{ color: C.inkMute }}>
              <div>
                <div className="font-mono-num font-bold text-base" style={{ color: C.ink }}>{p.triggers}</div>
                <div className="uppercase tracking-wider">Triggers /30d</div>
              </div>
              <div>
                <div
                  className="font-mono-num font-bold text-base"
                  style={{ color: p.success >= 95 ? C.ok : C.warn }}
                >
                  {p.success}%
                </div>
                <div className="uppercase tracking-wider">Success</div>
              </div>
              <div>
                <div className="font-mono-num font-bold text-base" style={{ color: C.ink }}>
                  ~{Math.round(p.triggers * 3.4)}m
                </div>
                <div className="uppercase tracking-wider">Time saved</div>
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
const ROLES = [
  { role: 'Platform Admin',     users: 4,  perms: 'Full access · all modules · settings' },
  { role: 'SOC Analyst',        users: 18, perms: 'Threat Detection · Incidents · Runbooks' },
  { role: 'Security Engineer',  users: 9,  perms: 'Security · Compliance · Audit' },
  { role: 'Executive Viewer',   users: 12, perms: 'Read-only dashboards & reports' },
  { role: 'AI Tuning',          users: 3,  perms: 'AI Insights · model configuration' },
];

const AI_SETTINGS = [
  { l: 'Auto-remediation confidence threshold', v: '85%' },
  { l: 'Anomaly detection sensitivity',          v: 'Medium' },
  { l: 'Root-cause inference depth',             v: '3 hops' },
  { l: 'Historical learning window',             v: '90 days' },
  { l: 'Correlation window',                     v: '15 minutes' },
  { l: 'Auto-escalation threshold',              v: 'P1 only' },
];

export function SettingsPage() {
  const [tab, setTab] = useState('Connectors');

  return (
    <div className="space-y-5">
      <div className="azure-commandbar flex items-end justify-between px-5 py-4">
        <div>
        <div className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-1" style={{ color: C.inkMute }}>
          Platform Configuration
        </div>
        <h1 className="font-display text-2xl font-semibold" style={{ color: C.ink }}>Settings</h1>
        </div>
        <Pill tone="neutral">Enterprise configuration</Pill>
      </div>

      <TabBar
        tabs={['Connectors', 'Roles & Access', 'Notifications', 'AI Tuning', 'Alert Thresholds', 'Theme']}
        active={tab}
        onChange={setTab}
      />

      {tab === 'Connectors' && (
        <Panel>
          <SectionHead sub="API configuration" title="Connector endpoints & credentials" />
          <div className="space-y-3">
            {CONNECTORS.slice(0, 6).map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between py-2 border-b"
                style={{ borderColor: C.border }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 flex items-center justify-center font-mono-num font-bold text-xs"
                    style={{
                      background: C.panelAlt,
                      color: C.ink,
                      border: `1px solid ${C.border}`,
                      borderRadius: 4,
                    }}
                  >
                    {c.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium text-sm" style={{ color: C.ink }}>{c.name}</div>
                    <div className="text-[10px] font-mono-num" style={{ color: C.inkMute }}>
                      https://api.{c.id}.example.com/v2 · token: ••••••••••{c.id.substring(0, 4)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Pill tone={c.status === 'connected' ? 'ok' : c.status === 'degraded' ? 'warn' : 'crit'}>
                    {c.status}
                  </Pill>
                  <button
                    className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1"
                    style={{ color: C.accent }}
                  >
                    Configure
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {tab === 'Roles & Access' && (
        <Panel>
          <SectionHead sub="RBAC" title="Role-based access control" />
          <div className="space-y-3">
            {ROLES.map((r) => (
              <div
                key={r.role}
                className="flex items-center justify-between py-2.5 border-b"
                style={{ borderColor: C.border }}
              >
                <div className="flex items-center gap-3">
                  <Users size={14} style={{ color: C.inkMute }} />
                  <div>
                    <div className="font-medium text-sm" style={{ color: C.ink }}>{r.role}</div>
                    <div className="text-[11px]" style={{ color: C.inkSoft }}>{r.perms}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono-num text-xs" style={{ color: C.inkMute }}>
                    {r.users} users
                  </span>
                  <button
                    className="text-[10px] uppercase tracking-wider font-semibold"
                    style={{ color: C.accent }}
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {tab === 'AI Tuning' && (
        <Panel>
          <SectionHead sub="AIOps engine configuration" title="Model behavior & thresholds" />
          <div className="grid grid-cols-2 gap-5">
            {AI_SETTINGS.map((s) => (
              <div key={s.l} className="py-2.5 border-b" style={{ borderColor: C.border }}>
                <div className="text-[11px]" style={{ color: C.inkMute }}>{s.l}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="font-mono-num font-semibold text-sm" style={{ color: C.ink }}>{s.v}</span>
                  <button
                    className="text-[10px] uppercase tracking-wider font-semibold"
                    style={{ color: C.accent }}
                  >
                    Modify
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {tab === 'Notifications' && (
        <Panel>
          <SectionHead sub="Alert routing" title="Notification channels" />
          <div className="space-y-3">
            {[
              { channel: 'PagerDuty', detail: 'Security on-call · P1, P2' },
              { channel: 'Slack #db-alerts', detail: 'Platform team · all severities' },
              { channel: 'Email', detail: 'Daily executive digest' },
            ].map((n) => (
              <div key={n.channel} className="flex justify-between py-2 border-b" style={{ borderColor: C.border }}>
                <div>
                  <div className="font-medium text-sm" style={{ color: C.ink }}>{n.channel}</div>
                  <div className="text-[11px]" style={{ color: C.inkSoft }}>{n.detail}</div>
                </div>
                <Pill tone="ok">Enabled</Pill>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {tab === 'Alert Thresholds' && (
        <Panel>
          <SectionHead sub="Policy" title="Metric thresholds" />
          <div className="grid grid-cols-2 gap-3 text-sm" style={{ color: C.ink }}>
            {[
              ['CPU', 'Warn 75%', 'Crit 90%'],
              ['Replication lag', 'Warn 5s', 'Crit 30s'],
              ['Connection pool', 'Warn 80%', 'Crit 95%'],
              ['Policy SLA', 'Warn 15m', 'Crit 60m'],
            ].map(([m, w, c]) => (
              <div key={m} className="py-2 border-b" style={{ borderColor: C.border }}>
                <div className="font-medium">{m}</div>
                <div className="text-[11px] font-mono-num mt-1"><span style={{ color: C.warn }}>{w}</span> · <span style={{ color: C.crit }}>{c}</span></div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {tab === 'Theme' && (
        <Panel>
          <SectionHead sub="Appearance" title="Console theme" />
          <div className="grid grid-cols-3 gap-3">
            {['Industrial (active)', 'High contrast', 'Compact density'].map((name, i) => (
              <button
                key={name}
                type="button"
                className="p-4 border text-left text-sm font-medium"
                style={{
                  borderColor: i === 0 ? C.accent : C.border,
                  background: i === 0 ? C.accentSoft : C.panel,
                  borderRadius: 8,
                  color: C.ink,
                }}
              >
                {name}
              </button>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
