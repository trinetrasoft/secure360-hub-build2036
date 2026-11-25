/** Live Secure 360 Hub client for the ingestion API on port 8010. */

export const API_BASE = 'http://127.0.0.1:8010';

export type Role = 'SOC_ANALYST' | 'INCIDENT_COMMANDER' | 'ADMIN';

export type Principal = {
  tenantId: string;
  role: Role;
  subject: string;
};

const STORAGE_KEY = 'secure360.principal';
const DEFAULT_TENANT = '11111111-1111-1111-1111-111111111111';

const SUBJECTS: Record<Role, string> = {
  SOC_ANALYST: 'analyst-1',
  INCIDENT_COMMANDER: 'commander-1',
  ADMIN: 'admin-1',
};

export function subjectFor(role: Role): string {
  return SUBJECTS[role];
}

export function readPrincipal(): Principal {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Principal;
      if (parsed.tenantId && parsed.role && parsed.subject) return parsed;
    }
  } catch {
    /* ignore unreadable session storage */
  }
  return {
    tenantId: DEFAULT_TENANT,
    role: 'SOC_ANALYST',
    subject: SUBJECTS.SOC_ANALYST,
  };
}

export function writePrincipal(next: Principal): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function authHeaders(principal: Principal = readPrincipal()): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Trinetra-Tenant': principal.tenantId,
    'X-Trinetra-Role': principal.role,
    'X-Trinetra-Subject': principal.subject,
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers || {}) },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail = body && typeof body === 'object' && 'detail' in body ? body.detail : response.statusText;
    throw new Error(typeof detail === 'string' ? detail : 'Request failed');
  }
  return body as T;
}

export type Health = {
  status: string;
  execution_mode: 'mock' | 'live' | string;
  connectors?: Record<string, { scope: string; status: string }>;
};

export function getHealth(): Promise<Health> {
  return request<Health>('/api/v1/health');
}

export function listTickets(): Promise<Ticket[]> {
  return request<Ticket[]>('/api/v1/tickets');
}

export function getTicket(ticketId: string): Promise<Ticket> {
  return request<Ticket>(`/api/v1/tickets/${ticketId}`);
}

export function advanceTicket(ticketId: string): Promise<Ticket> {
  return request<Ticket>(`/api/v1/tickets/${ticketId}/advance`, { method: 'POST' });
}

export function issueApprovalToken(ticketId: string): Promise<{ approval_token: string }> {
  return request(`/api/v1/tickets/${ticketId}/approval-token`, { method: 'POST' });
}

export function approveTicket(
  ticketId: string,
  body: { approval_token?: string; analyst_click?: boolean; policy_id?: string },
): Promise<Ticket> {
  return request<Ticket>(`/api/v1/tickets/${ticketId}/approve`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function askCopilot(ticketId: string, question: string): Promise<{ answer: string; scoped: boolean }> {
  return request(`/api/v1/tickets/${ticketId}/query`, {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}

export function getTimeline(ticketId: string): Promise<Timeline> {
  return request<Timeline>(`/api/v1/tickets/${ticketId}/timeline`);
}

export function listKnowledge(): Promise<KnowledgeEntry[]> {
  return request<KnowledgeEntry[]>('/api/v1/knowledge');
}

export type Ticket = {
  id: string;
  tenant_id: string;
  source: string;
  title: string;
  description: string;
  priority: string;
  risk_score: number;
  stage: string;
  status: string;
  category: string | null;
  runbook_id: string | null;
  approval_mode: string | null;
  approval_status: string;
  assignee_role: string | null;
  policy_id: string | null;
  sla_due_at: string;
  sla_minutes: number;
  opened_at: string;
  closed_at: string | null;
  entity_tags: string[];
  stages: Array<{
    stage: string;
    entered_at: string;
    sla_due_at: string;
    sla_minutes: number;
    actor: string;
  }>;
  root_cause: {
    category?: string;
    confidence?: number;
    narrative?: string;
    evidence?: string[];
  } | null;
  runbook: {
    runbook_id?: string;
    actions?: string[];
    rationale?: string;
  } | null;
};

export type Timeline = {
  ticket_id: string;
  stages: Array<{ stage: string; entered_at: string; sla_due_at: string; actor: string }>;
  audit: Array<{
    sequence: number;
    action: string;
    summary: string;
    created_at: string;
    previous_hash: string;
    record_hash: string;
  }>;
};

export type KnowledgeEntry = {
  id: string;
  ticket_id: string;
  title: string;
  body: string;
  created_at: string;
};
