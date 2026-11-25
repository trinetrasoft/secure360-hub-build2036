import React from 'react';
import { Search, Clock, RefreshCw, Bell, User, LogOut, Plus } from 'lucide-react';
import { C } from '../theme/colors';

const COMMAND_TABS = [
  { id: 'overview', label: 'Overview', target: 'executive' },
  { id: 'resources', label: 'Resources', target: 'architecture' },
  { id: 'alerts', label: 'Alerts', target: 'incidents' },
];

function resolveActiveCommandTab(activePage) {
  if (activePage === 'incidents') return 'alerts';
  if (activePage === 'architecture' || activePage === 'integrations' || activePage === 'storage') {
    return 'resources';
  }
  return 'overview';
}

export default function Header({
  env,
  onEnvChange,
  liveTime,
  onSignOut,
  activePage,
  onNavigate,
  principal,
  onPrincipalChange,
  executionMode = 'mock',
}) {
  const activeCommandTab = resolveActiveCommandTab(activePage);

  return (
    <header
      className="px-6 py-3 border-b"
      style={{ background: C.header, borderColor: C.border }}
    >
      <div
        className="azure-commandbar flex flex-col gap-2 px-4 py-3"
        style={{ background: C.headerSoft }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative min-w-0 flex-1 max-w-xl">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: C.inkMute }}
            />
            <input
              placeholder="Search threats, policies, assets, incidents, runbooks…"
              className="azure-input w-full min-w-0 pl-9 pr-14 py-2 text-[13px]"
              style={{ color: C.ink }}
            />
            <kbd
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-mono-num px-1.5 py-0.5"
              style={{
                background: '#ffffff',
                border: `1px solid ${C.border}`,
                color: C.inkMute,
                borderRadius: 4,
              }}
            >
              ⌘K
            </kbd>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-auto">
          <button className="azure-icon-button p-2 transition-colors" style={{ color: C.inkSoft }} aria-label="Refresh data">
            <RefreshCw size={15} strokeWidth={1.8} />
          </button>

          <button className="azure-icon-button p-2 transition-colors" style={{ color: C.inkSoft }} aria-label="Create resource">
            <Plus size={15} strokeWidth={1.8} />
          </button>

          <button className="azure-icon-button relative p-2" style={{ color: C.inkSoft }} aria-label="Notifications">
            <Bell size={15} strokeWidth={1.8} />
            <span
              className="absolute -top-1 -right-1 w-4 h-4 text-[8px] font-bold font-mono-num flex items-center justify-center text-white pulse-dot"
              style={{ background: C.crit, borderRadius: 999 }}
            >
              7
            </span>
          </button>

          <div className="flex items-center gap-2 pl-3 ml-1 border-l azure-shell-divider">
            <div
              className="w-8 h-8 flex items-center justify-center"
              style={{ background: C.sidebar, borderRadius: 6 }}
              aria-label="User profile"
            >
              <User size={14} strokeWidth={1.8} className="text-white" />
            </div>
            <div className="text-xs leading-tight hidden sm:block min-w-[132px]">
              <div className="font-semibold text-[11px]" style={{ color: C.ink }}>
                Secure360 Hub
              </div>
              <div style={{ color: C.inkMute }} className="text-[10px]">
                CISO · Security Operations
              </div>
            </div>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="azure-icon-button p-2 ml-1"
                style={{ color: C.inkSoft }}
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut size={14} strokeWidth={1.8} />
              </button>
            )}
          </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {COMMAND_TABS.map((tab) => {
            const isActive = activeCommandTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onNavigate?.(tab.target)}
                className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] shrink-0"
                style={{
                  background: isActive ? C.accentSoft : '#ffffff',
                  border: `1px solid ${isActive ? C.borderStrong : C.border}`,
                  color: isActive ? C.accentHover : C.inkSoft,
                  borderRadius: 8,
                }}
                aria-pressed={isActive}
              >
                {tab.label}
              </button>
            );
          })}
          <div
            className="flex items-center gap-2 px-3 py-2 text-[11px] azure-icon-button whitespace-nowrap shrink-0"
            style={{ color: C.inkSoft }}
          >
            <Clock size={12} style={{ color: C.inkMute }} />
            <span className="font-mono-num">{liveTime} UTC</span>
          </div>
          <select
            value={env}
            onChange={(e) => onEnvChange(e.target.value)}
            className="azure-select text-[12px] px-3 py-2 font-medium shrink-0"
          >
            <option>All Environments</option>
            <option>Production</option>
            <option>Staging</option>
            <option>DR</option>
            <option>Development</option>
          </select>
          {principal && onPrincipalChange && (
            <>
              <select
                aria-label="SOC role"
                value={principal.role}
                onChange={(e) => onPrincipalChange({ ...principal, role: e.target.value })}
                className="azure-select text-[11px] px-2 py-2 font-semibold shrink-0 w-[188px]"
              >
                <option value="SOC_ANALYST">SOC_ANALYST</option>
                <option value="INCIDENT_COMMANDER">INCIDENT_COMMANDER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
              <input
                aria-label="Tenant id"
                value={principal.tenantId}
                onChange={(e) => onPrincipalChange({ ...principal, tenantId: e.target.value.trim() })}
                className="azure-input text-[11px] font-mono-num px-2 py-2 w-[168px] shrink-0"
                spellCheck={false}
              />
            </>
          )}
          <span
            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 shrink-0 whitespace-nowrap"
            style={{
              borderRadius: 999,
              background: executionMode === 'live' ? '#fee2e2' : C.accentSoft,
              color: executionMode === 'live' ? C.crit : C.accentHover,
              border: `1px solid ${executionMode === 'live' ? '#fecaca' : C.border}`,
            }}
          >
            {executionMode === 'live' ? 'LIVE M365' : 'MOCK'}
          </span>
        </div>
      </div>
    </header>
  );
}
