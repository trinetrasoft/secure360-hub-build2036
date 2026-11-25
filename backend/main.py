"""
DB Command Centre — Backend API

FastAPI service exposing mock endpoints that the front-end consumes.
In production, each route handler calls the corresponding connector
class (Splunk, ServiceNow, Datadog, etc.) and returns normalized data.

Run:
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000
"""
from datetime import datetime, timedelta
from random import randint, choice, uniform
from typing import Optional

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from connectors.base import BaseConnector
from connectors.splunk import SplunkConnector
from connectors.servicenow import ServiceNowConnector

app = FastAPI(
    title="DB Command Centre API",
    version="2.4.1",
    description="Enterprise database operations platform — single pane of glass.",
)

# Allow Vite dev server during development. Restrict in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------------------------------------------------------
# Connector registry — in production this would read from a DB or config.
# ----------------------------------------------------------------------------
CONNECTORS: dict[str, BaseConnector] = {
    "splunk": SplunkConnector(),
    "servicenow": ServiceNowConnector(),
}


# ----------------------------------------------------------------------------
# Models
# ----------------------------------------------------------------------------
class HealthResponse(BaseModel):
    status: str
    version: str
    timestamp: datetime
    databases_total: int
    databases_healthy: int
    databases_warning: int
    databases_critical: int


class Incident(BaseModel):
    id: str
    title: str
    severity: str
    status: str
    db: str
    region: str
    environment: str
    assignee: str
    minutes_ago: int
    ai_confidence: int


# ----------------------------------------------------------------------------
# Routes
# ----------------------------------------------------------------------------
@app.get("/api/health", response_model=HealthResponse)
def health():
    """Aggregate platform health — backs the executive dashboard hero."""
    return HealthResponse(
        status="operational",
        version="2.4.1",
        timestamp=datetime.utcnow(),
        databases_total=1547,
        databases_healthy=1497,
        databases_warning=33,
        databases_critical=17,
    )


@app.get("/api/incidents")
def list_incidents(
    severity: Optional[str] = Query(None, description="Filter by P1/P2/P3"),
    region: Optional[str] = None,
    limit: int = 50,
):
    """List active incidents — pulls from connected ITSM tools in production."""
    DB_TYPES = ["oracle", "pg", "mysql", "sqlsrv", "mongo", "cassandra", "redis"]
    REGIONS = ["US-East", "US-West", "UK", "India", "Singapore", "Hong Kong", "Australia"]
    ENVS = ["Production", "Staging", "DR", "Development"]
    TITLES = [
        "High CPU on primary node",
        "Replication lag exceeded threshold",
        "Slow query degradation",
        "Backup failure on shard",
        "Tablespace approaching capacity",
        "Connection pool exhausted",
        "Suspicious admin login",
    ]

    incidents = []
    for i in range(min(limit, 34)):
        sev = choice(["P1", "P1", "P2", "P2", "P3", "P3", "P3"])
        if severity and sev != severity:
            continue
        reg = choice(REGIONS)
        if region and reg != region:
            continue
        incidents.append({
            "id": f"INC-{48200 + i}",
            "title": choice(TITLES),
            "severity": sev,
            "status": choice(["Active", "AI-Resolving", "Investigating", "Escalated"]),
            "db": f"{choice(DB_TYPES)}-prod-{randint(1, 99):02d}",
            "region": reg,
            "environment": choice(ENVS),
            "assignee": choice(["AI Agent", "D. Mehta", "A. Chen", "R. Patel", "Unassigned"]),
            "minutes_ago": randint(2, 480),
            "ai_confidence": randint(62, 97),
        })
    return {"incidents": incidents, "total": len(incidents)}


@app.get("/api/compliance")
def compliance():
    """Compliance posture across frameworks. In prod: query Astra/Wiz/Prisma."""
    return {
        "frameworks": [
            {"framework": "CIS Benchmark", "score": 87, "passed": 358, "failed": 54, "total": 412},
            {"framework": "ISO 27001",     "score": 91, "passed": 289, "failed": 29, "total": 318},
            {"framework": "PCI-DSS",       "score": 84, "passed": 215, "failed": 41, "total": 256},
            {"framework": "SOX",           "score": 93, "passed": 184, "failed": 14, "total": 198},
            {"framework": "GDPR",          "score": 88, "passed": 153, "failed": 21, "total": 174},
            {"framework": "HIPAA",         "score": 90, "passed": 128, "failed": 14, "total": 142},
        ]
    }


@app.get("/api/security/vulnerabilities")
def vulnerabilities():
    return {
        "by_severity": [
            {"severity": "Critical", "count": 14},
            {"severity": "High",     "count": 47},
            {"severity": "Medium",   "count": 132},
            {"severity": "Low",      "count": 218},
            {"severity": "Info",     "count": 89},
        ],
        "total": 500,
    }


@app.get("/api/performance")
def performance():
    """Return 24h rolling resource utilization."""
    return {
        "series": [
            {
                "h": f"{i:02d}:00",
                "cpu":  round(uniform(35, 82)),
                "mem":  round(uniform(48, 88)),
                "iops": round(uniform(2200, 8900)),
                "qps":  round(uniform(12000, 48000)),
            }
            for i in range(24)
        ]
    }


@app.get("/api/capacity")
def capacity():
    """Capacity forecast — days-of-runway per fleet segment."""
    return {
        "forecast": [
            {"segment": "Oracle Production", "current_pct": 72, "days_to_full": 47},
            {"segment": "PostgreSQL",        "current_pct": 64, "days_to_full": 89},
            {"segment": "MongoDB Sharded",   "current_pct": 84, "days_to_full": 11},
            {"segment": "Redis Cluster",     "current_pct": 38, "days_to_full": 142},
        ]
    }


@app.get("/api/integrations")
def integrations():
    """Connector registry status. In production: query connector health table."""
    out = []
    for cid, conn in CONNECTORS.items():
        out.append({
            "id": cid,
            "name": conn.name,
            "category": conn.category,
            "status": conn.status,
            "last_sync": conn.last_sync.isoformat() if conn.last_sync else None,
        })
    return {"connectors": out}


@app.get("/api/ai/recommendations")
def ai_recommendations():
    """AI engine output — root-cause, suggestion, predicted impact."""
    return {
        "recommendations": [
            {
                "id": "AI-9821",
                "priority": "P1",
                "confidence": 94,
                "title": "Replication lag spike on oracle-prod-12 likely caused by network saturation",
                "root_cause": "Cross-region link to DR site showing 340ms latency vs 45ms baseline.",
                "suggestion": "Throttle backup parallelism from 8 to 4 streams. Stagger DR backup by 90 min.",
                "impact": "~4hr restoration to baseline; eliminates 3 cascade incidents/week",
                "related": ["INC-48231", "INC-48217", "INC-48204"],
            },
            {
                "id": "AI-9820",
                "priority": "P2",
                "confidence": 88,
                "title": "PostgreSQL connection pool exhaustion predicted within 47 min on pg-prod-04",
                "root_cause": "Connection growth rate 2.3x normal. Top consumer: order-service.",
                "suggestion": "Apply pgbouncer transaction pooling. Recycle idle > 5min connections.",
                "impact": "Prevents P1 outage; saves ~$8.4K in SLA credits",
                "related": ["INC-48198"],
            },
        ]
    }


@app.post("/api/ai/remediate/{incident_id}")
def trigger_remediation(incident_id: str):
    """Apply an auto-remediation playbook to an incident."""
    return {
        "incident_id": incident_id,
        "playbook": "RB-204",
        "status": "executing",
        "estimated_duration_sec": 180,
        "steps": [
            "Kill blocking session SID 4291",
            "Throttle parallel batch jobs",
            "Increase SGA target by 8GB",
        ],
    }


@app.get("/")
def root():
    return {
        "service": "DB Command Centre API",
        "version": "2.4.1",
        "docs": "/docs",
        "endpoints": [
            "/api/health",
            "/api/incidents",
            "/api/compliance",
            "/api/security/vulnerabilities",
            "/api/performance",
            "/api/capacity",
            "/api/integrations",
            "/api/ai/recommendations",
            "/api/ai/remediate/{incident_id}",
        ],
    }
