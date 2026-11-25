# DB Command Centre — Backend API

FastAPI service exposing the endpoints the front-end consumes.

## Quick start

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Then open:

- API root: http://localhost:8000
- Interactive docs: http://localhost:8000/docs
- OpenAPI schema: http://localhost:8000/openapi.json

## Endpoints

| Method | Path                                | Purpose                              |
|--------|-------------------------------------|--------------------------------------|
| GET    | `/api/health`                       | Platform aggregate health            |
| GET    | `/api/incidents`                    | Active incident queue                |
| GET    | `/api/compliance`                   | Compliance scores per framework      |
| GET    | `/api/security/vulnerabilities`     | Vulnerability distribution by CVSS   |
| GET    | `/api/performance`                  | 24h rolling resource utilization     |
| GET    | `/api/capacity`                     | Capacity forecast per segment        |
| GET    | `/api/integrations`                 | Connector registry status            |
| GET    | `/api/ai/recommendations`           | AIOps recommendations                |
| POST   | `/api/ai/remediate/{incident_id}`   | Trigger auto-remediation playbook    |

## Connector framework

All connectors live in `backend/connectors/` and inherit from `BaseConnector`.
Production swap: each subclass replaces its `fetch_*` methods with real API
calls. The shape returned stays identical — the dashboard layer doesn't know
or care which source system the data came from.

Shipped (with mocked data):

- `splunk.py` — Splunk SIEM
- `servicenow.py` — ServiceNow ITSM

The other 17 connectors from the brief (Flexera, OEM, Datadog, Dynatrace,
AppDynamics, Grafana, Prometheus, Jira, Elastic, CrowdStrike, Prisma, Wiz,
Tenable, AWS CloudWatch, Azure Monitor, GCP Operations, Astra) follow the
exact same pattern — copy `splunk.py`, rename, point at the new endpoint.
