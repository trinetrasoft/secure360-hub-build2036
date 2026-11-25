import { BaseConnector } from './BaseConnector';

/**
 * Splunk SIEM Connector.
 *
 * Production swap: replace mock methods with real Splunk REST API calls
 * (search/jobs/export, alert listing, saved searches). Auth via HEC token
 * or session-key. Normalize Splunk events into the platform's incident shape.
 */
export class SplunkConnector extends BaseConnector {
  constructor(config = {}) {
    super({
      id: 'splunk',
      name: 'Splunk SIEM',
      category: 'SIEM',
      endpoint: config.endpoint || 'https://splunk.example.com:8089',
      auth: config.auth || { type: 'token', token: 'mock-token' },
    });
  }

  async healthCheck() {
    // Production: GET /services/server/info
    await this._simulateLatency();
    return { status: 'connected', version: '9.1.2', lag: 2 };
  }

  async fetchIncidents() {
    // Production: POST /services/search/jobs/export with SPL query.
    await this._simulateLatency();
    return [
      {
        id: 'SPLK-48231',
        source: 'splunk',
        severity: 'high',
        title: 'Multiple failed admin logins on oracle-prod-04',
        timestamp: new Date().toISOString(),
        host: 'oracle-prod-04',
      },
      {
        id: 'SPLK-48230',
        source: 'splunk',
        severity: 'medium',
        title: 'Unusual data egress from pg-prod-12',
        timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        host: 'pg-prod-12',
      },
    ];
  }

  async fetchMetrics() {
    await this._simulateLatency();
    return [
      { metric: 'events_per_sec',  value: 14283 },
      { metric: 'index_lag_sec',   value: 2 },
      { metric: 'active_searches', value: 47 },
    ];
  }

  _simulateLatency() {
    return new Promise((r) => setTimeout(r, 50 + Math.random() * 150));
  }
}
