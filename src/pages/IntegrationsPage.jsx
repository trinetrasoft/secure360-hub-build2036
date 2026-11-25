import React, { useState, useMemo } from 'react';
import { Wifi, WifiOff, AlertTriangle, Activity, Plug } from 'lucide-react';
import Panel from '../components/ui/Panel';
import Kpi from '../components/ui/Kpi';
import TabBar from '../components/ui/TabBar';
import SectionHead from '../components/ui/SectionHead';
import { C } from '../theme/colors';
import {
  CONNECTORS as INITIAL_CONNECTORS,
  AVAILABLE_CONNECTORS,
  isConnectorActive,
  canDisconnectConnector,
} from '../mock-data/connectors';
import { ALL_ENVS } from '../mock-data/envScope';
import AddConnectorModal from '../components/integrations/AddConnectorModal';
import ConnectConnectorModal from '../components/integrations/ConnectConnectorModal';

const INTEGRATION_TABS = ['Connected', 'Available'];

function formatRecordsTotal(connectors) {
  const total = connectors.reduce((s, c) => s + (c.records || 0), 0);
  if (total >= 1_000_000) return `${(total / 1_000_000).toFixed(1)}M`;
  if (total >= 1_000) return `${Math.round(total / 1000)}K`;
  return String(total);
}

function avgLag(connectors) {
  const active = connectors.filter((c) => c.status !== 'error' && c.status !== 'available' && c.lag > 0);
  if (!active.length) return '—';
  const avg = active.reduce((s, c) => s + c.lag, 0) / active.length;
  return `${avg.toFixed(1)}s`;
}

function ConnectorCard({ connector, onConnect, onDisconnect, showDisconnect }) {
  const isAvailable = connector.status === 'available';
  const status =
    connector.status === 'connected'
      ? 'ok'
      : connector.status === 'degraded'
        ? 'warn'
        : connector.status === 'available'
          ? 'neutral'
          : 'crit';
  const statusColor =
    status === 'ok' ? C.ok : status === 'warn' ? C.warn : status === 'neutral' ? C.inkMute : C.crit;
  const statusLabel =
    connector.status === 'available' ? 'available' : connector.status;

  return (
    <Panel padding="p-4" className="hover:shadow-sm transition-shadow h-full flex flex-col">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 flex items-center justify-center font-mono-num font-bold text-xs shrink-0"
            style={{
              background: C.panelAlt,
              color: C.ink,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
            }}
          >
            {connector.name.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="font-display font-semibold text-sm" style={{ color: C.ink }}>
              {connector.name}
            </div>
            <div
              className="text-[10px] uppercase tracking-wider font-semibold"
              style={{ color: C.inkMute }}
            >
              {connector.cat}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`w-1.5 h-1.5 rounded-full ${connector.status === 'connected' ? 'pulse-dot' : ''}`}
            style={{ background: statusColor }}
          />
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: statusColor }}
          >
            {statusLabel}
          </span>
        </div>
      </div>

      {connector.endpoint && (
        <div className="text-[10px] font-mono-num truncate mb-2" style={{ color: C.inkMute }} title={connector.endpoint}>
          {connector.endpoint}
        </div>
      )}
      {connector.description && (
        <div className="text-[11px] mb-2 line-clamp-2" style={{ color: C.inkSoft }}>
          {connector.description}
        </div>
      )}

      {isAvailable ? (
        <div className="mt-auto pt-2">
          <button
            type="button"
            onClick={() => onConnect?.(connector)}
            className="w-full text-[11px] font-semibold uppercase tracking-wider py-2 text-white"
            style={{ background: C.accent, borderRadius: 6 }}
          >
            Connect
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-[10px] mt-auto pt-1" style={{ color: C.inkMute }}>
            <div>
              <div className="font-mono-num font-semibold text-xs" style={{ color: C.ink }}>
                {connector.records.toLocaleString()}
              </div>
              <div className="uppercase tracking-wider">Records</div>
            </div>
            <div>
              <div
                className="font-mono-num font-semibold text-xs"
                style={{ color: connector.lag > 30 ? C.warn : C.ink }}
              >
                {connector.lag}s
              </div>
              <div className="uppercase tracking-wider">Lag</div>
            </div>
            <div>
              <div className="font-mono-num font-semibold text-xs" style={{ color: C.ink }}>
                {connector.lastSync}
              </div>
              <div className="uppercase tracking-wider">Synced</div>
            </div>
          </div>
          {showDisconnect && (
            <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
              <button
                type="button"
                onClick={() => onDisconnect?.(connector)}
                className="w-full text-[11px] font-semibold uppercase tracking-wider py-2 hover:opacity-90 transition-opacity"
                style={{
                  background: C.panelAlt,
                  color: C.crit,
                  border: `1px solid ${C.border}`,
                  borderRadius: 6,
                }}
              >
                Disconnect
              </button>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

export default function IntegrationsPage({ env = ALL_ENVS }) {
  const [connectors, setConnectors] = useState(INITIAL_CONNECTORS);
  const [modalOpen, setModalOpen] = useState(false);
  const [connectTarget, setConnectTarget] = useState(null);
  const [activeTab, setActiveTab] = useState('Connected');

  const connectedList = useMemo(
    () => connectors.filter((c) => isConnectorActive(c)),
    [connectors]
  );

  const availableList = useMemo(() => {
    const fleetIds = new Set(connectors.map((c) => c.id));
    const failed = connectors.filter((c) => c.status === 'error');
    const catalog = AVAILABLE_CONNECTORS.filter((c) => !fleetIds.has(c.id));
    return [...failed, ...catalog];
  }, [connectors]);

  const connected = connectors.filter((c) => c.status === 'connected').length;
  const degraded = connectors.filter((c) => c.status === 'degraded').length;
  const errors = connectors.filter((c) => c.status === 'error').length;
  const recordsLabel = formatRecordsTotal(connectors);
  const lagLabel = avgLag(connectors);

  const handleAddConnector = (connector) => {
    setConnectors((prev) => [connector, ...prev]);
    setActiveTab(isConnectorActive(connector) ? 'Connected' : 'Available');
  };

  const handleOpenConnect = (catalogItem) => {
    setConnectTarget(catalogItem);
  };

  const handleConnectFromModal = (connected) => {
    setConnectors((prev) => {
      const idx = prev.findIndex((c) => c.id === connected.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = connected;
        return next;
      }
      return [...prev, connected];
    });
    setActiveTab('Connected');
    setConnectTarget(null);
  };

  const handleDisconnect = (connector) => {
    setConnectors((prev) => prev.filter((c) => c.id !== connector.id));
    setActiveTab('Available');
  };

  const visibleList = activeTab === 'Connected' ? connectedList : availableList;

  return (
    <div className="space-y-5">
      <div className="azure-commandbar flex items-end justify-between px-5 py-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-1" style={{ color: C.inkMute }}>
            Data Integration Layer
          </div>
          <h1 className="font-display text-2xl font-semibold" style={{ color: C.ink }}>
            Security integration framework
          </h1>
          <div className="text-xs mt-1" style={{ color: C.inkSoft }}>
            {connected} of {connectors.length} connectors active · {recordsLabel} records · avg lag {lagLabel}
            {env !== ALL_ENVS && ` · ${env}`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 text-white hover:opacity-90 transition-opacity"
          style={{ background: C.accent, borderRadius: 6 }}
        >
          + Add Connector
        </button>
      </div>

      <div className="grid grid-cols-12 gap-4 items-stretch">
        <div className="col-span-3 h-full flex">
          <Kpi label="Active" value={connected} unit={`/${connectors.length}`} tone="ok" icon={Wifi} />
        </div>
        <div className="col-span-3 h-full flex">
          <Kpi label="Degraded" value={degraded} tone="warn" icon={AlertTriangle} />
        </div>
        <div className="col-span-3 h-full flex">
          <Kpi label="Errors" value={errors} tone="crit" icon={WifiOff} />
        </div>
        <div className="col-span-3 h-full flex">
          <Kpi label="Records / 24h" value={recordsLabel} tone="ok" delta={8.2} icon={Activity} />
        </div>
      </div>

      <TabBar tabs={INTEGRATION_TABS} active={activeTab} onChange={setActiveTab} size="large" />

      <SectionHead
        sub={
          activeTab === 'Connected'
            ? `${connectedList.length} active integrations · syncing data`
            : `${availableList.length} connectors ready to connect`
        }
        title={activeTab === 'Connected' ? 'Connected integrations' : 'Available connectors'}
        action={
          activeTab === 'Available' ? (
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider" style={{ color: C.inkMute }}>
              <Plug size={12} /> Catalog
            </span>
          ) : null
        }
      />

      {visibleList.length > 0 ? (
        <div className="grid grid-cols-3 gap-3 items-stretch">
          {visibleList.map((c) => (
            <ConnectorCard
              key={c.id}
              connector={c}
              onConnect={activeTab === 'Available' ? handleOpenConnect : undefined}
              onDisconnect={activeTab === 'Connected' ? handleDisconnect : undefined}
              showDisconnect={activeTab === 'Connected' && canDisconnectConnector(c)}
            />
          ))}
        </div>
      ) : (
        <Panel>
          <div className="py-12 text-center text-sm" style={{ color: C.inkMute }}>
            {activeTab === 'Connected'
              ? 'No connected integrations. Add a connector or switch to Available.'
              : 'No available connectors in catalog.'}
          </div>
        </Panel>
      )}

      <AddConnectorModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdd={handleAddConnector}
      />

      <ConnectConnectorModal
        connector={connectTarget}
        open={Boolean(connectTarget)}
        onClose={() => setConnectTarget(null)}
        onConnect={handleConnectFromModal}
      />
    </div>
  );
}
