import { SECURITY_DOMAINS } from './helpers';
import { DOMAIN_ASSET_COUNTS } from './securityData';

/** Security asset inventory per domain with health distribution (totals align to 1,548). */
function generateInventory() {
  const critRates = { Cloud: 0.04, Identity: 0.06, Endpoint: 0.05, Network: 0.03, Application: 0.04, Data: 0.05, 'AI Systems': 0.07 };
  const warnRates = { Cloud: 0.12, Identity: 0.14, Endpoint: 0.11, Network: 0.10, Application: 0.13, Data: 0.12, 'AI Systems': 0.15 };

  return SECURITY_DOMAINS.map((name) => {
    const count = DOMAIN_ASSET_COUNTS[name];
    const critical = Math.max(1, Math.round(count * critRates[name]));
    const warning = Math.max(2, Math.round(count * warnRates[name]));
    const healthy = Math.max(0, count - critical - warning);
    return { name, count, healthy, warning, critical };
  });
}

export const INVENTORY = generateInventory();
export const TOTAL_DBS = INVENTORY.reduce((s, x) => s + x.count, 0);
export const TOTAL_CRIT = INVENTORY.reduce((s, x) => s + x.critical, 0);
export const TOTAL_WARN = INVENTORY.reduce((s, x) => s + x.warning, 0);
export const TOTAL_OK = TOTAL_DBS - TOTAL_CRIT - TOTAL_WARN;
