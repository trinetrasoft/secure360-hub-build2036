import { BaseConnector } from './BaseConnector';

/**
 * ServiceNow ITSM Connector.
 *
 * Production swap: replace mock methods with calls to the ServiceNow
 * Table API (/api/now/table/incident, /api/now/table/cmdb_ci_database).
 * Auth via OAuth 2.0 client credentials.
 */
export class ServiceNowConnector extends BaseConnector {
  constructor(config = {}) {
    super({
      id: 'servicenow',
      name: 'ServiceNow',
      category: 'ITSM',
      endpoint: config.endpoint || 'https://example.service-now.com',
      auth: config.auth || { type: 'oauth', token: 'mock-token' },
    });
  }

  async healthCheck() {
    // Production: GET /api/now/stats/sys_user
    await this._sim();
    return { status: 'connected', instance: 'example', lag: 4 };
  }

  async fetchIncidents() {
    // Production: GET /api/now/table/incident?sysparm_query=active=true^priority<=2
    await this._sim();
    return [
      {
        id: 'INC0048231',
        source: 'servicenow',
        severity: 'P1',
        title: 'Production database degradation — checkout service',
        assigned_to: 'DBA Tier-2',
        opened_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      },
    ];
  }

  async fetchMetrics() {
    await this._sim();
    return [
      { metric: 'open_incidents', value: 34 },
      { metric: 'mttr_minutes',   value: 42 },
      { metric: 'sla_breaches',   value: 3 },
    ];
  }

  /** Create a ticket — example of write operation. */
  async createIncident(payload) {
    // Production: POST /api/now/table/incident
    await this._sim();
    return {
      id: `INC${Date.now()}`,
      ...payload,
      created_at: new Date().toISOString(),
    };
  }

  _sim() {
    return new Promise((r) => setTimeout(r, 50 + Math.random() * 150));
  }
}
