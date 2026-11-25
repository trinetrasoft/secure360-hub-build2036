import { getHardwareEolData } from '../mock-data/hardwareEol';

const delay = (ms = 260) => new Promise((r) => setTimeout(r, ms));

export async function fetchHardwareEolDashboard(env = 'All Environments') {
  await delay();
  return getHardwareEolData(env);
}
