/**
 * BaseConnector — abstract contract that every enterprise connector implements.
 *
 * In production, each subclass would replace the mocked methods with real
 * API calls (Splunk REST, ServiceNow REST/SOAP, AWS SDK, etc.). The shape
 * of the returned data stays identical so the front-end is decoupled from
 * the underlying source system.
 */
export class BaseConnector {
  /**
   * @param {object} config
   * @param {string} config.id        Unique connector id
   * @param {string} config.name      Display name
   * @param {string} config.category  Category (ITSM, SIEM, APM, etc.)
   * @param {string} config.endpoint  API endpoint
   * @param {object} config.auth      Auth config (token / oauth / basic)
   */
  constructor(config) {
    this.id       = config.id;
    this.name     = config.name;
    this.category = config.category;
    this.endpoint = config.endpoint;
    this.auth     = config.auth;
    this.status   = 'idle';
    this.lastSync = null;
  }

  /** Health-check the connector — used by the integration grid. */
  async healthCheck() {
    throw new Error('healthCheck() must be implemented by subclass');
  }

  /** Pull incidents/events from the source. Returns a normalized array. */
  async fetchIncidents() {
    throw new Error('fetchIncidents() must be implemented by subclass');
  }

  /** Pull metrics from the source. Returns a normalized array. */
  async fetchMetrics() {
    throw new Error('fetchMetrics() must be implemented by subclass');
  }

  /** Optional: pull compliance findings (relevant for security tools). */
  async fetchComplianceFindings() {
    return [];
  }

  /** Periodic poller — subclasses can override interval. */
  startPolling(callback, intervalMs = 30000) {
    this._poll = setInterval(async () => {
      try {
        const data = await this.healthCheck();
        callback({ id: this.id, ok: true, data });
      } catch (err) {
        callback({ id: this.id, ok: false, error: err.message });
      }
    }, intervalMs);
  }

  stopPolling() {
    if (this._poll) clearInterval(this._poll);
  }
}
