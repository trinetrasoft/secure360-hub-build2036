import {
  SECURITY_INTEGRATIONS_CONNECTED,
  SECURITY_INTEGRATIONS_AVAILABLE,
  TOTAL_PROTECTED_ASSETS,
} from './securityData';

export const CONNECTORS = SECURITY_INTEGRATIONS_CONNECTED.map((c) => ({
  ...c,
  records: c.id === 'prisma' || c.id === 'wiz' ? TOTAL_PROTECTED_ASSETS : c.records,
}));

export const AVAILABLE_CONNECTORS = SECURITY_INTEGRATIONS_AVAILABLE;

export const BASELINE_CONNECTOR_IDS = new Set(CONNECTORS.map((c) => c.id));

export function isConnectorActive(connector) {
  return connector.status === 'connected' || connector.status === 'degraded';
}

export function canDisconnectConnector(connector) {
  return !BASELINE_CONNECTOR_IDS.has(connector.id);
}
