# DB Command Centre

**Enterprise Database Operations Platform** — a Single Pane of Glass for Database Monitoring, Security, Governance, Compliance, Incident Management, and AIOps.

Built as a reference implementation of an integration-led control plane that consolidates signals from 19 enterprise tools (Flexera, ServiceNow, Oracle OEM, Astra, Splunk, AWS CloudWatch, Azure Monitor, GCP Operations, Datadog, Dynatrace, AppDynamics, Grafana, Prometheus, Jira, Elastic SIEM, CrowdStrike, Prisma Cloud, Wiz, Tenable) into one console.

---

## What's inside

```
db-command-centre/
├── index.html                  # Vite entry
├── package.json                # Frontend deps
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
│
├── src/
│   ├── main.jsx                # React bootstrap
│   ├── App.jsx                 # Shell — sidebar, header, page router
│   ├── index.css               # Tailwind + custom animations
│   │
│   ├── components/
│   │   ├── Sidebar.jsx         # Dark slate nav with module badges
│   │   ├── Header.jsx          # Global search + env switcher + clock
│   │   └── ui/
│   │       ├── Panel.jsx       # Reusable card surface
│   │       ├── Pill.jsx        # Status/severity tags
│   │       ├── Kpi.jsx         # Metric card with sparkline + delta
│   │       ├── TabBar.jsx      # Underlined tab navigation
│   │       └── SectionHead.jsx # Title block with eyebrow + action
│   │
│   ├── pages/
│   │   ├── ExecutiveDashboard.jsx       # KPIs, trends, regional health, cost, risk heatmap
│   │   ├── OperationsDashboard.jsx      # DBA fleet view, slow queries, performance
│   │   ├── SecurityDashboard.jsx        # Posture score, vuln distribution, frameworks
│   │   ├── IncidentCommand.jsx          # War room — queue + AI analysis + timeline
│   │   ├── IntegrationsPage.jsx         # 19-connector grid
│   │   ├── AIInsights.jsx               # AIOps recommendations
│   │   └── ReportsAutomationSettings.jsx# Reports, playbooks, RBAC, AI tuning
│   │
│   ├── theme/colors.js         # Single source of truth for design tokens
│   ├── mock-data/              # Generators for inventory, incidents, etc.
│   └── connectors/             # BaseConnector + Splunk/ServiceNow examples
│
└── backend/
    ├── main.py                 # FastAPI app
    ├── requirements.txt
    └── connectors/             # Python mirror of the connector framework
        ├── base.py
        ├── splunk.py
        └── servicenow.py
```

---

## Quick start

### Frontend (mock-data mode — works standalone)

```bash
npm install
npm run dev
```

Then open the URL Vite prints (default `http://localhost:5173`).

The frontend ships with rich mock data so you can demo every module without a backend running.

### Backend (optional)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Then open `http://localhost:8000/docs` for the interactive API documentation.

### Run both together

In separate terminals:

```bash
# Terminal 1
npm run dev

# Terminal 2
cd backend && uvicorn main:app --reload --port 8000
```

The Vite dev server is already CORS-allowed by the FastAPI backend.

---

## Design language

Refined industrial aesthetic, inspired by Bloomberg Terminal × Datadog × Grafana × Linear:

- **Canvas** warm off-white (`#f6f5f1`) instead of generic blue-grey
- **Anchor** deep slate sidebar (`#0b1220`)
- **Accent** single industrial teal (`#0d9488`)
- **Typography** IBM Plex Sans (display) + IBM Plex Mono (numeric)
- **Status** semantic green/amber/red, never decorative
- **Density** Bloomberg-style — every pixel earns its place
- **Numbers** tabular, monospace, never proportional

All tokens live in `src/theme/colors.js`. Change one value, see the entire UI shift.

---

## Modules

| Module               | Purpose                                                                                |
|----------------------|----------------------------------------------------------------------------------------|
| Executive Dashboard  | C-suite KPIs, fleet health, regional distribution, cost, risk heatmap                  |
| DBA Operations       | Per-DB-type fleet view (Oracle/PG/MySQL/SQL Server/Mongo/Cassandra/Redis), slow queries |
| Security & Compliance| 6-framework posture (CIS, ISO, PCI, SOX, GDPR, HIPAA), vulnerabilities                   |
| Incident Command     | Live queue, AI root-cause analysis, auto-remediation playbooks, timeline               |
| Integrations         | 19-connector grid with health, lag, record counts                                       |
| AI Insights          | AIOps recommendations — root cause, suggested action, predicted impact                  |
| Reports              | Generated reports inventory with exports                                                |
| Automation           | Self-healing playbooks with success rates                                               |
| Settings             | Connectors, RBAC, notifications, AI tuning, alert thresholds                            |

---

## Extending it

### Add a new connector

1. Create `src/connectors/MyConnector.js` extending `BaseConnector`.
2. (Backend) Create `backend/connectors/my_connector.py` extending `BaseConnector`.
3. Register in `backend/main.py` connector registry.
4. Add a mock entry to `src/mock-data/connectors.js` (shows up in the grid).

### Migrate to Next.js

The structure is intentionally compatible:

- Move `src/pages/*.jsx` → `app/<route>/page.jsx`
- Use Server Components where data fetching is server-side
- Replace `useState`-based routing in `App.jsx` with Next App Router
- Move static assets in `public/` over (already named correctly)

### Switch from mock to live data

In each `src/mock-data/*.js` file, replace the static export with a fetch:

```js
// Before
export const INCIDENTS = generateIncidents(34);

// After
export async function getIncidents() {
  const res = await fetch('http://localhost:8000/api/incidents');
  return (await res.json()).incidents;
}
```

Then convert the consuming page to a hook (`useIncidents()`).

---

## Tech stack

- **Frontend** React 18, Vite 5, Tailwind 3 (core utilities only), Recharts 2, Lucide icons
- **Backend** FastAPI, Pydantic 2, Uvicorn
- **Fonts** IBM Plex Sans + Mono (Google Fonts CDN — first-paint cached after initial load)
- **Charts** Recharts (declarative, React-native, SVG)

---

## License

Reference implementation. Use freely as a starting point for internal tooling.
