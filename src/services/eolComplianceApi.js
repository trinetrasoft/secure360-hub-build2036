/**
 * Dummy API layer for EOL compliance data.
 * Replace fetch implementations with real connector calls (AWS Config, ServiceNow CMDB, etc.).
 */
import { getEolComplianceData } from '../mock-data/eolCompliance';

const delay = (ms = 280) => new Promise((r) => setTimeout(r, ms));

export async function fetchEolComplianceDashboard(env = 'All Environments') {
  await delay();
  return getEolComplianceData(env);
}

export async function fetchEolInstanceDetail(instanceId, env = 'All Environments') {
  await delay(120);
  const { instances } = getEolComplianceData(env);
  return instances.find((i) => i.id === instanceId) ?? null;
}
