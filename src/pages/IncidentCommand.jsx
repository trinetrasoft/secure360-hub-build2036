import React, { useState, useMemo, useEffect } from 'react';
import {
  AlertOctagon, Brain, ArrowUpRight, Clock, Activity, GitBranch,
  Sparkles, PlayCircle, BookOpen, CheckCircle2,
} from 'lucide-react';
import Panel from '../components/ui/Panel';
import Pill from '../components/ui/Pill';
import Kpi from '../components/ui/Kpi';
import TabBar from '../components/ui/TabBar';
import { C } from '../theme/colors';
import {
  INCIDENTS,
  INCIDENT_TAB_FILTERS,
  KNOWLEDGE_ARTICLES,
} from '../mock-data/incidents';
import {
  advanceTicket,
  approveTicket,
  askCopilot,
  getTimeline,
  issueApprovalToken,
  listKnowledge,
  listTickets,
} from '../services/secure360Api';

const TABS = [
  'Active Incidents',
  'AI Recommendations',
  'Auto-Resolved',
  'Escalated',
  'Knowledge Base',
];

const TAB_COPY = {
  'Active Incidents': {
    title: 'Active operational incidents',
    queueLabel: 'open',
  },
  'AI Recommendations': {
    title: 'AI-driven recommendations',
    queueLabel: 'pending review',
  },
  'Auto-Resolved': {
    title: 'Auto-resolved incidents',
    queueLabel: 'closed (24h)',
  },
  Escalated: {
    title: 'Escalated incidents',
    queueLabel: 'awaiting human action',
  },
  'Knowledge Base': {
    title: 'Runbooks & knowledge articles',
    queueLabel: 'articles',
  },
};

function IncidentRow({ inc, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(inc)}
      className="w-full text-left px-5 py-3 border-b transition-colors"
      style={{
        borderColor: C.border,
        background: selected?.id === inc.id ? C.accentSoft : 'transparent',
        borderLeft: selected?.id === inc.id ? `3px solid ${C.accent}` : '3px solid transparent',
        paddingLeft: selected?.id === inc.id ? 17 : 20,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Pill tone={inc.severity === 'P1' ? 'p1' : inc.severity === 'P2' ? 'p2' : 'p3'} size="xs">
            {inc.severity}
          </Pill>
          <span className="font-mono-num text-[11px] font-semibold" style={{ color: C.inkSoft }}>
            {inc.id}
          </span>
          {inc.assignee === 'AI Agent' && (
            <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: '#7c3aed' }}>
              <Sparkles size={9} /> AI
            </span>
          )}
          {inc.status === 'Escalated' && (
            <Pill tone="crit" size="xs">Escalated</Pill>
          )}
          {(inc.status === 'Auto-Resolved' || inc.status === 'Resolved') && (
            <Pill tone="ok" size="xs">Resolved</Pill>
          )}
        </div>
        <span className="text-[10px] font-mono-num shrink-0" style={{ color: C.inkMute }}>
          {inc.slaLabel || '—'}
        </span>
      </div>
      <div className="text-xs font-medium mb-1" style={{ color: C.ink }}>
        {inc.title}
      </div>
      <div className="flex items-center gap-3 text-[10px] flex-wrap" style={{ color: C.inkMute }}>
        <span>{inc.stage}</span>
        <span>·</span>
        <span>{inc.source}</span>
        {(inc.entityTags || []).map((tag) => (
          <span
            key={tag}
            className="font-mono-num px-1.5 py-0.5 rounded"
            style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.inkSoft }}
          >
            {tag}
          </span>
        ))}
      </div>
    </button>
  );
}

function KnowledgeRow({ article, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(article)}
      className="w-full text-left px-5 py-3 border-b transition-colors"
      style={{
        borderColor: C.border,
        background: selected?.id === article.id ? C.accentSoft : 'transparent',
        borderLeft: selected?.id === article.id ? `3px solid ${C.accent}` : '3px solid transparent',
        paddingLeft: selected?.id === article.id ? 17 : 20,
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <Pill tone="accent" size="xs">{article.category}</Pill>
        <span className="font-mono-num text-[11px] font-semibold" style={{ color: C.inkSoft }}>
          {article.id}
        </span>
      </div>
      <div className="text-xs font-medium mb-1" style={{ color: C.ink }}>
        {article.title}
      </div>
      <div className="flex items-center gap-2 text-[10px]" style={{ color: C.inkMute }}>
        <span>Updated {article.updated}</span>
        <span>·</span>
        <span>{article.uses} uses</span>
      </div>
    </button>
  );
}

function IncidentDetail({
  incident,
  tab,
  timeline,
  onRemediate,
  onEscalate,
  busy,
  copilotAnswer,
  onAsk,
}) {
  const isResolved = ['Auto-Resolved', 'Resolved'].includes(incident.status);
  const isEscalated = incident.status === 'Escalated';
  const isAiTab = tab === 'AI Recommendations';
  const [question, setQuestion] = useState('');
  const [tokenOpen, setTokenOpen] = useState(false);
  const [tokenValue, setTokenValue] = useState('');
  const [tokenError, setTokenError] = useState('');
  const events = [
    ...(timeline?.stages || []).map((stage) => ({
      t: stage.entered_at,
      e: stage.stage,
      d: `SLA ${stage.sla_due_at} · ${stage.actor}`,
      dot: C.accent,
    })),
    ...(timeline?.audit || []).map((row) => ({
      t: row.created_at,
      e: row.action,
      d: `${row.summary} · ${row.record_hash.slice(0, 12)}`,
      dot: C.info,
    })),
  ];

  return (
    <div>
      <div className="px-5 py-4 border-b" style={{ borderColor: C.border, background: C.panelAlt }}>
        <div className="flex items-center justify-between mb-2">
          <Pill tone={incident.severity === 'P1' ? 'p1' : incident.severity === 'P2' ? 'p2' : 'p3'}>
            {incident.severity} INCIDENT
          </Pill>
          <span className="font-mono-num text-[11px]" style={{ color: C.inkMute }}>
            {incident.id}
          </span>
        </div>
        <div className="font-display font-semibold text-sm" style={{ color: C.ink }}>
          {incident.title}
        </div>
        <div className="flex items-center gap-3 text-[11px] mt-2 flex-wrap" style={{ color: C.inkSoft }}>
          <span>{incident.stage}</span>
          <span>·</span>
          <span>{incident.source}</span>
          <span>·</span>
          <span>{incident.status}</span>
          {(incident.entityTags || []).map((tag) => (
            <span key={tag} className="font-mono-num">{tag}</span>
          ))}
        </div>
        {isEscalated && incident.escalatedTo && (
          <div className="mt-2 text-[11px] font-semibold" style={{ color: C.crit }}>
            Escalated to {incident.escalatedTo}
          </div>
        )}
        {isResolved && incident.resolvedAt && (
          <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold" style={{ color: C.ok }}>
            <CheckCircle2 size={12} /> Auto-resolved {incident.resolvedAt}
          </div>
        )}
      </div>

      {!isResolved && (
        <div className="px-5 py-4 border-b" style={{ borderColor: C.border }}>
          <div
            className="text-[10px] uppercase tracking-widest font-semibold mb-2 flex items-center gap-1.5"
            style={{ color: '#7c3aed' }}
          >
            <Sparkles size={11} />
            {isAiTab ? 'AI Recommendation' : 'AI Analysis'} · {incident.aiConfidence}% confidence
          </div>
          <div className="space-y-3 text-[12px]" style={{ color: C.inkSoft }}>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: C.inkMute }}>
                Likely root cause
              </div>
              <div style={{ color: C.ink }}>{incident.rootCause}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: C.inkMute }}>
                {isAiTab ? 'Recommended action' : 'Suggested resolution'}
              </div>
              <div style={{ color: C.ink }}>{incident.suggestedResolution}</div>
            </div>
            {!isResolved && (
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: C.inkMute }}>
                  Predicted impact if unresolved
                </div>
                <div style={{ color: C.crit }}>{incident.predictedImpact}</div>
              </div>
            )}
          </div>
          {!isResolved && (
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => onRemediate(incident.id)}
                className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 flex items-center gap-1.5 text-white"
                style={{ background: C.accent, borderRadius: 6 }}
              >
                <PlayCircle size={12} /> Run Auto-Remediation
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (incident.severity === 'P1') {
                    setTokenOpen(true);
                    setTokenValue('');
                  }
                  onEscalate(incident.id);
                }}
                className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5"
                style={{
                  background: C.panelAlt,
                  border: `1px solid ${C.border}`,
                  color: C.inkSoft,
                  borderRadius: 6,
                }}
              >
                Escalate
              </button>
            </div>
          )}
          {tokenOpen && (
            <form
              className="mt-3 space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                onEscalate(incident.id, tokenValue);
                setTokenOpen(false);
              }}
            >
              <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
                P1 approval token
              </div>
              <input
                value={tokenValue}
                onChange={(event) => setTokenValue(event.target.value)}
                className="azure-input w-full text-[12px] font-mono-num px-2 py-1.5"
                placeholder="Paste the one-time commander token"
              />
              <button
                type="button"
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: C.accentHover }}
                onClick={async () => {
                  try {
                    const issued = await issueApprovalToken(incident.id);
                    setTokenValue(issued.approval_token);
                    setTokenError('');
                  } catch (err) {
                    setTokenError(err.message);
                  }
                }}
              >
                Issue token
              </button>
              <button
                type="submit"
                className="ml-3 text-[10px] font-semibold uppercase tracking-wider text-white px-2 py-1"
                style={{ background: C.accent, borderRadius: 6 }}
              >
                Approve
              </button>
              {tokenError && (
                <p className="text-[11px]" style={{ color: C.crit }}>{tokenError}</p>
              )}
            </form>
          )}
        </div>
      )}

      {isResolved && (
        <div className="px-5 py-4 border-b text-[12px]" style={{ borderColor: C.border, color: C.inkSoft }}>
          <div className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: C.inkMute }}>
            Resolution summary
          </div>
          <p style={{ color: C.ink }}>
            Playbook executed automatically. {incident.suggestedResolution}
          </p>
          <p className="mt-2" style={{ color: C.ok }}>
            No further action required. MTTR: {incident.mttr}m
          </p>
        </div>
      )}

      <div className="px-5 py-4">
        <div className="text-[10px] uppercase tracking-widest font-semibold mb-3" style={{ color: C.inkMute }}>
          Timeline
        </div>
        <div className="space-y-3">
          {(events.length > 0 ? events : [{ t: '—', e: 'No stage history yet', d: incident.stage, dot: C.warn }]).map((s, i, arr) => (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center pt-0.5">
                <div className="w-2 h-2 rounded-full" style={{ background: s.dot }} />
                {i < arr.length - 1 && (
                  <div className="w-px flex-1 mt-1" style={{ background: C.border, minHeight: 24 }} />
                )}
              </div>
              <div className="pb-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold" style={{ color: C.ink }}>{s.e}</span>
                  <span className="text-[10px] font-mono-num" style={{ color: C.inkMute }}>{s.t}</span>
                </div>
                <div className="text-[11px]" style={{ color: C.inkSoft }}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <form
        className="px-5 py-4 border-t"
        style={{ borderColor: C.border }}
        onSubmit={(event) => {
          event.preventDefault();
          if (question.trim()) onAsk(incident.id, question.trim());
        }}
      >
        <div className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: '#7c3aed' }}>
          SOC Copilot · {incident.id}
        </div>
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask about this incident only"
            className="azure-input flex-1 text-[12px] px-2 py-1.5"
          />
          <button
            type="submit"
            className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 text-white"
            style={{ background: C.accent, borderRadius: 6 }}
          >
            Ask
          </button>
        </div>
        {copilotAnswer && (
          <p className="mt-2 text-[12px]" style={{ color: C.ink }}>{copilotAnswer}</p>
        )}
      </form>
    </div>
  );
}

function KnowledgeDetail({ article }) {
  return (
    <div>
      <div className="px-5 py-4 border-b" style={{ borderColor: C.border, background: C.panelAlt }}>
        <div className="flex items-center gap-2 mb-2">
          <Pill tone="accent">{article.category}</Pill>
          <span className="font-mono-num text-[11px]" style={{ color: C.inkMute }}>{article.id}</span>
        </div>
        <div className="font-display font-semibold text-sm" style={{ color: C.ink }}>
          {article.title}
        </div>
        <div className="flex gap-2 mt-2 flex-wrap">
          {article.tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.inkSoft }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
      <div className="px-5 py-4">
        <div className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: C.inkMute }}>
          Summary
        </div>
        <p className="text-[13px] leading-relaxed" style={{ color: C.ink }}>
          {article.summary}
        </p>
        <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-3 text-[12px]" style={{ borderColor: C.border }}>
          <div>
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
              Last updated
            </span>
            <div className="font-mono-num mt-0.5" style={{ color: C.ink }}>{article.updated}</div>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
              Times used
            </span>
            <div className="font-mono-num mt-0.5" style={{ color: C.ink }}>{article.uses}</div>
          </div>
        </div>
        <button
          type="button"
          className="mt-4 text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 flex items-center gap-1.5 text-white"
          style={{ background: C.accent, borderRadius: 6 }}
        >
          <BookOpen size={12} /> Open full runbook
        </button>
      </div>
    </div>
  );
}

function slaLabel(iso) {
  if (!iso) return '—';
  const due = Date.parse(iso.endsWith('Z') ? iso : `${iso}Z`);
  if (Number.isNaN(due)) return '—';
  const minutes = Math.ceil((due - Date.now()) / 60000);
  if (minutes <= 0) return 'overdue';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

function minutesBetween(start, end) {
  const opened = Date.parse(start?.endsWith('Z') ? start : `${start}Z`);
  const closed = Date.parse(end?.endsWith('Z') ? end : `${end}Z`);
  if (Number.isNaN(opened) || Number.isNaN(closed)) return null;
  return Math.max(1, Math.round((closed - opened) / 60000));
}

function toIncident(ticket) {
  const current = (ticket.stages || []).find((stage) => stage.stage === ticket.stage);
  const closed = ticket.status === 'closed' || ticket.stage === '6. VERIFY & CLOSE';
  const escalated = !closed && ticket.approval_mode === 'commander_token';
  const hasRunbook = Boolean(ticket.runbook_id);
  let status = 'Active';
  if (closed && (ticket.approval_mode === 'auto_execute' || ticket.priority === 'P3')) status = 'Auto-Resolved';
  else if (closed) status = 'Resolved';
  else if (escalated) status = 'Escalated';
  else if (hasRunbook) status = 'AI-Resolving';
  const actions = ticket.runbook?.actions || [];
  return {
    id: ticket.id,
    severity: ticket.priority,
    title: ticket.title,
    status,
    stage: ticket.stage,
    source: ticket.source,
    entityTags: ticket.entity_tags || [],
    slaLabel: slaLabel(current?.sla_due_at || ticket.sla_due_at),
    assignee: ticket.assignee_role || 'SOC',
    rootCause: ticket.root_cause?.narrative || 'Triage has not produced a root cause yet.',
    suggestedResolution: ticket.runbook
      ? `${ticket.runbook.runbook_id}: ${actions.join(', ')}. ${ticket.runbook.rationale || ''}`
      : 'No runbook yet. Advance the ticket into AI triage.',
    predictedImpact: `${ticket.priority} SLA ${ticket.sla_minutes}m · ${ticket.stage}`,
    aiConfidence: Math.round((ticket.root_cause?.confidence || 0) * 100),
    aiRecommendation: hasRunbook,
    escalatedTo: ticket.assignee_role,
    resolvedAt: ticket.closed_at,
    mttr: minutesBetween(ticket.opened_at, ticket.closed_at),
  };
}

const SAMPLE_STAGES = [
  '1. INTAKE',
  '2. AI TRIAGE',
  '3. INVESTIGATE',
  '4. ASSIGN',
  '5. RESOLVE',
  '6. VERIFY & CLOSE',
];

const SAMPLE_STAGE_FOR_STATUS = {
  Active: '1. INTAKE',
  Investigating: '3. INVESTIGATE',
  'AI-Resolving': '2. AI TRIAGE',
  Escalated: '4. ASSIGN',
  'Auto-Resolved': '6. VERIFY & CLOSE',
  Resolved: '6. VERIFY & CLOSE',
};

function toSampleIncident(incident) {
  const closed = incident.status === 'Auto-Resolved' || incident.status === 'Resolved';
  return {
    id: incident.id,
    sample: true,
    severity: incident.severity,
    title: incident.title,
    status: incident.status,
    stage: SAMPLE_STAGE_FOR_STATUS[incident.status] || '1. INTAKE',
    source: 'sample',
    entityTags: ['[USER_01]', '[IP_01]'],
    slaLabel: closed ? 'closed' : (incident.severity === 'P1' ? '15m' : incident.severity === 'P2' ? '2h' : '24h'),
    assignee: incident.assignee,
    rootCause: incident.rootCause,
    suggestedResolution: incident.suggestedResolution,
    predictedImpact: incident.predictedImpact,
    aiConfidence: incident.aiConfidence,
    aiRecommendation: Boolean(incident.aiRecommendation),
    escalatedTo: incident.escalatedTo,
    resolvedAt: incident.resolvedAt,
    mttr: incident.mttr,
  };
}

function sampleTimeline(incident) {
  const current = Math.max(0, SAMPLE_STAGES.indexOf(incident.stage));
  const now = Date.now();
  return {
    stages: SAMPLE_STAGES.slice(0, current + 1).map((stage, index) => ({
      stage,
      entered_at: new Date(now - (current - index) * 5 * 60000).toISOString(),
      sla_due_at: incident.slaLabel,
      actor: 'sample',
    })),
    audit: [],
  };
}

function toArticle(entry) {
  return {
    id: entry.id,
    category: 'Runbook',
    title: entry.title,
    updated: entry.created_at,
    uses: 1,
    tags: [entry.ticket_id],
    summary: entry.body,
  };
}

export default function IncidentCommand({ principal, executionMode = 'mock' }) {
  const [tab, setTab] = useState('Active Incidents');
  const [severityFilter, setSeverityFilter] = useState('All');
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [articles, setArticles] = useState([]);
  const [timeline, setTimeline] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [copilotAnswer, setCopilotAnswer] = useState('');
  const showSamples = executionMode !== 'live';

  const load = async () => {
    const samples = showSamples ? INCIDENTS.map(toSampleIncident) : [];
    const sampleArticles = showSamples ? KNOWLEDGE_ARTICLES : [];
    try {
      const [tickets, knowledge] = await Promise.all([listTickets(), listKnowledge()]);
      const mapped = [...tickets.map(toIncident), ...samples];
      const mappedArticles = knowledge.length ? knowledge.map(toArticle) : sampleArticles;
      setIncidents(mapped);
      setArticles(mappedArticles);
      setSelectedArticle((prev) => mappedArticles.find((item) => item.id === prev?.id) || mappedArticles[0] || null);
      setError('');
      return mapped;
    } catch (err) {
      setIncidents(samples);
      setArticles(sampleArticles);
      setSelectedArticle((prev) => sampleArticles.find((item) => item.id === prev?.id) || sampleArticles[0] || null);
      if (!showSamples) setError(err.message || 'Live API is unavailable');
      return samples;
    }
  };

  useEffect(() => {
    let cancelled = false;
    load().catch(() => {
      if (!cancelled && !showSamples) setError('Live API is unavailable');
    });
    return () => {
      cancelled = true;
    };
  }, [principal?.tenantId, principal?.role, showSamples]);

  const isKnowledgeTab = tab === 'Knowledge Base';

  const tabIncidents = useMemo(() => {
    const filterFn = INCIDENT_TAB_FILTERS[tab];
    if (!filterFn) return [];
    return incidents.filter(filterFn);
  }, [tab, incidents]);

  const filteredIncidents = useMemo(() => {
    if (severityFilter === 'All') return tabIncidents;
    return tabIncidents.filter((item) => item.severity === severityFilter);
  }, [tabIncidents, severityFilter]);

  useEffect(() => {
    setSeverityFilter('All');
  }, [tab]);

  useEffect(() => {
    if (!isKnowledgeTab) {
      setSelectedIncident((prev) => filteredIncidents.find((item) => item.id === prev?.id) || filteredIncidents[0] || null);
    }
  }, [tab, filteredIncidents, isKnowledgeTab]);

  useEffect(() => {
    if (!selectedIncident || selectedIncident.sample) {
      setTimeline(selectedIncident?.sample ? sampleTimeline(selectedIncident) : null);
      return undefined;
    }
    let cancelled = false;
    getTimeline(selectedIncident.id)
      .then((next) => {
        if (!cancelled) setTimeline(next);
      })
      .catch(() => {
        if (!cancelled) setTimeline(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedIncident?.id]);

  const closedMinutes = incidents
    .map((item) => item.mttr)
    .filter((value) => typeof value === 'number');
  const mttr = closedMinutes.length
    ? Math.round(closedMinutes.reduce((sum, value) => sum + value, 0) / closedMinutes.length)
    : 0;

  const runRemediation = async (ticketId) => {
    if (incidents.find((item) => item.id === ticketId)?.sample) {
      setNotice('Sample incident. Remediation runs after Microsoft 365 is connected.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      for (let step = 0; step < 6; step += 1) {
        const next = await advanceTicket(ticketId);
        if (next.stage === '6. VERIFY & CLOSE') break;
        if (next.stage === '4. ASSIGN' && next.approval_status === 'pending') break;
      }
      await load();
    } catch (err) {
      setError(err.message);
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const escalate = async (ticketId, token) => {
    if (incidents.find((item) => item.id === ticketId)?.sample) {
      setNotice('Sample incident. Escalation runs after Microsoft 365 is connected.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const current = incidents.find((item) => item.id === ticketId);
      let stage = current?.stage;
      let priority = current?.severity;
      let latest = null;
      for (let step = 0; step < 6 && stage && stage !== '4. ASSIGN' && stage !== '6. VERIFY & CLOSE'; step += 1) {
        latest = await advanceTicket(ticketId);
        stage = latest.stage;
        priority = latest.priority;
      }
      if (priority === 'P1' && !token) {
        setTab('Escalated');
        setError('P1 remediation stays blocked until an Incident Commander submits the approval token.');
        await load();
        return;
      }
      if (stage === '4. ASSIGN') {
        if (priority === 'P1') {
          await approveTicket(ticketId, { approval_token: token });
        } else {
          await approveTicket(ticketId, { analyst_click: true });
        }
        await advanceTicket(ticketId);
      }
      await load();
    } catch (err) {
      setError(err.message);
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const ask = async (ticketId, question) => {
    if (incidents.find((item) => item.id === ticketId)?.sample) {
      setCopilotAnswer('Sample incident. The copilot answers from the live ticket after Microsoft 365 is connected.');
      return;
    }
    setError('');
    try {
      const result = await askCopilot(ticketId, question);
      setCopilotAnswer(result.scoped ? result.answer : result.answer);
    } catch (err) {
      setError(err.message);
    }
  };

  const copy = TAB_COPY[tab];
  const queueCount = isKnowledgeTab ? articles.length : filteredIncidents.length;

  return (
    <div className="space-y-5">
      <div className="azure-commandbar flex items-end justify-between px-5 py-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-1" style={{ color: C.inkMute }}>
            Incident Command · War Room
          </div>
          <h1 className="font-display text-2xl font-semibold" style={{ color: C.ink }}>
            {copy.title}
          </h1>
          <div className="text-xs mt-1" style={{ color: error ? C.crit : C.inkSoft }}>
            {error || notice || (showSamples
              ? 'Sample incidents are shown until Microsoft 365 is connected.'
              : 'Master-detail incident workspace with AI triage, escalation tracking, and runbook access.')}
          </div>
        </div>
        {!isKnowledgeTab && (
          <div className="flex items-center gap-2">
            <Pill tone="crit">{incidents.filter((i) => i.severity === 'P1' && INCIDENT_TAB_FILTERS[tab]?.(i)).length} P1</Pill>
            <Pill tone="warn">{incidents.filter((i) => i.severity === 'P2' && INCIDENT_TAB_FILTERS[tab]?.(i)).length} P2</Pill>
            <Pill tone="info">{incidents.filter((i) => i.severity === 'P3' && INCIDENT_TAB_FILTERS[tab]?.(i)).length} P3</Pill>
          </div>
        )}
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-2">
          <Kpi label="Open" value={incidents.filter(INCIDENT_TAB_FILTERS['Active Incidents']).length} icon={AlertOctagon} />
        </div>
        <div className="col-span-2">
          <Kpi label="AI Resolving" value={incidents.filter((i) => i.status === 'AI-Resolving').length} tone="ok" icon={Brain} />
        </div>
        <div className="col-span-2">
          <Kpi label="Escalated" value={incidents.filter((i) => i.status === 'Escalated').length} tone="crit" icon={ArrowUpRight} />
        </div>
        <div className="col-span-2"><Kpi label="MTTR" value={String(mttr)} unit="m" tone="ok" icon={Clock} /></div>
        <div className="col-span-2"><Kpi label="MTBF" value="18.4" unit="d" tone="ok" delta={12} icon={Activity} /></div>
        <div className="col-span-2"><Kpi label="Repeats" value="9" tone="warn" delta={-3} icon={GitBranch} /></div>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      <div className="grid grid-cols-12 gap-4">
        <Panel className="col-span-7" padding="p-0">
          <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: C.border }}>
            <div className="font-display font-semibold text-sm" style={{ color: C.ink }}>
              {isKnowledgeTab ? 'Knowledge base' : 'Incident queue'} · {queueCount} {copy.queueLabel}
            </div>
            {!isKnowledgeTab && (
              <div className="flex items-center gap-1.5">
                {['All', 'P1', 'P2', 'P3'].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSeverityFilter(p)}
                    className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1"
                    style={{
                      background: severityFilter === p ? C.accentSoft : 'transparent',
                      color: severityFilter === p ? C.accentHover : C.inkMute,
                      borderRadius: 6,
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="max-h-[560px] overflow-y-auto scrollbar-thin">
            {isKnowledgeTab
              ? articles.map((article) => (
                  <KnowledgeRow
                    key={article.id}
                    article={article}
                    selected={selectedArticle}
                    onSelect={setSelectedArticle}
                  />
                ))
              : filteredIncidents.length > 0
                ? filteredIncidents.map((inc) => (
                    <IncidentRow
                      key={inc.id}
                      inc={inc}
                      selected={selectedIncident}
                      onSelect={setSelectedIncident}
                    />
                  ))
                : (
                  <div className="px-5 py-12 text-center text-sm" style={{ color: C.inkMute }}>
                    No incidents in this view. Try another tab or filter.
                  </div>
                )}
          </div>
        </Panel>

        <Panel className="col-span-5" padding="p-0">
          {isKnowledgeTab && selectedArticle && <KnowledgeDetail article={selectedArticle} />}
          {!isKnowledgeTab && selectedIncident && (
            <IncidentDetail
              incident={selectedIncident}
              tab={tab}
              timeline={timeline}
              busy={busy}
              copilotAnswer={copilotAnswer}
              onRemediate={runRemediation}
              onEscalate={escalate}
              onAsk={ask}
            />
          )}
          {!isKnowledgeTab && !selectedIncident && (
            <div className="px-5 py-16 text-center text-sm" style={{ color: C.inkMute }}>
              Select an incident to view details.
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
