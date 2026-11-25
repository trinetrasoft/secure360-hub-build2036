# Connector Framework

Each enterprise integration is implemented as a subclass of `BaseConnector`.
The base class enforces a uniform contract so the dashboard can consume data
from any source without caring about the underlying API.

## Adding a new connector

```js
// src/connectors/MyConnector.js
import { BaseConnector } from './BaseConnector';

export class MyConnector extends BaseConnector {
  constructor(config = {}) {
    super({
      id: 'my-tool',
      name: 'My Tool',
      category: 'Observability',
      endpoint: config.endpoint,
      auth: config.auth,
    });
  }

  async healthCheck()      { /* ... */ }
  async fetchIncidents()   { /* ... */ }
  async fetchMetrics()     { /* ... */ }
}
```

## Currently shipped (with mock data)

- `SplunkConnector` — SIEM event ingestion
- `ServiceNowConnector` — ITSM ticket sync
- _Stubs for the remaining 17 connectors are pre-wired in `mock-data/connectors.js`._

## Wiring real APIs

When you're ready to wire a real source:

1. Replace mock methods with the real HTTP/SDK calls.
2. Add credentials to environment variables (never inline).
3. Normalize the response into the shape used by `mock-data/*.js`.
4. The dashboard automatically picks up the new data — no UI changes needed.
