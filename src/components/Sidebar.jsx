import React from 'react';
import {
  LayoutDashboard, HardDrive, FileCheck, Shield, AlertOctagon, Plug,
  Sparkles, FileText, Workflow, Settings, Radar, Waypoints,
} from 'lucide-react';
import BrandLogo from './BrandLogo';
import { C } from '../theme/colors';

export const NAV = [
  { id: 'executive',    label: 'Security Command',      icon: LayoutDashboard },
  { id: 'operations',   label: 'Threat Detection',      icon: Radar },
  { id: 'storage',      label: 'Data Governance',       icon: HardDrive },
  { id: 'backup',       label: 'Policy & Controls',     icon: FileCheck },
  { id: 'security',     label: 'Vulnerability Mgmt',    icon: Shield },
  { id: 'incidents',    label: 'Incident Response',     icon: AlertOctagon, badge: 7 },
  { id: 'integrations', label: 'Integrations',            icon: Plug },
  { id: 'architecture', label: 'Architecture',            icon: Waypoints },
  { id: 'ai',           label: 'AI Security',             icon: Sparkles, badge: 'NEW' },
  { id: 'reports',      label: 'Reports',                 icon: FileText },
  { id: 'automation',   label: 'Automation',              icon: Workflow },
  { id: 'settings',     label: 'Settings',                icon: Settings },
];

export default function Sidebar({ active, onNav }) {
  const shellBg = '#f7f9fc';
  const shellBorder = '#d7e3f1';
  const shellText = '#4b5f77';
  const shellMuted = '#7f93aa';

  return (
    <aside
      className="w-[248px] flex flex-col"
      style={{ background: shellBg, borderRight: `1px solid ${shellBorder}` }}
    >
      {/* Logo */}
      <div className="px-5 py-5 border-b" style={{ borderColor: shellBorder }}>
        <BrandLogo variant="sidebar" />
      </div>

      <div className="px-4 pt-4 pb-2">
        <div
          className="text-[9px] uppercase tracking-[0.22em] font-semibold px-2 pb-2"
          style={{ color: shellMuted }}
        >
          Secure360 Workspace
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 pb-4 space-y-1 overflow-y-auto scrollbar-thin">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              className="azure-nav-item w-full flex items-center gap-3 px-3 py-2.5 text-[13px] group"
              style={{
                color: isActive ? '#17324f' : shellText,
                background: isActive ? C.sidebarActive : 'transparent',
                borderRadius: 8,
                borderLeft: isActive ? `3px solid ${C.accent}` : '3px solid transparent',
                paddingLeft: isActive ? 9 : 12,
                boxShadow: isActive
                  ? '0 8px 18px rgba(15, 23, 42, 0.14), inset 0 0 0 1px rgba(255, 255, 255, 0.55)'
                  : 'none',
              }}
            >
              <Icon size={15} strokeWidth={isActive ? 2.1 : 1.7} />
              <span className="flex-1 text-left font-medium">{item.label}</span>
              {item.badge && (
                <span
                  className="text-[9px] font-mono-num font-bold px-1.5 py-0.5"
                  style={{
                    background: typeof item.badge === 'number' ? C.crit : C.accent,
                    color: '#fff',
                    borderRadius: 4,
                  }}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* System status footer */}
      <div className="p-4 border-t" style={{ borderColor: shellBorder }}>
        <div
          className="px-2 py-2 flex items-center gap-2 text-[11px] rounded-md"
          style={{ color: shellText, background: '#eef3f8', border: `1px solid ${shellBorder}` }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full pulse-dot"
            style={{ background: C.ok }}
          />
          <span className="font-mono-num">Security posture nominal</span>
        </div>
        <div className="px-2 pt-2 text-[10px] font-mono-num" style={{ color: shellMuted }}>
          19 integrations · 4ms SIEM lag
        </div>
      </div>
    </aside>
  );
}
