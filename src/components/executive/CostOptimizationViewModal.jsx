import React from 'react';
import { X, ExternalLink, CheckCircle2 } from 'lucide-react';
import Panel from '../ui/Panel';
import Pill from '../ui/Pill';
import { C } from '../../theme/colors';
import {
  CSP_META,
  formatSavings,
  getOptimizationDetail,
  priorityTone,
  categoryColor,
} from '../../mock-data/costOptimization';

function CspBadge({ meta }) {
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5"
      style={{ background: meta.bg, color: meta.color, borderRadius: 2 }}
    >
      {meta.label}
    </span>
  );
}

export default function CostOptimizationViewModal({ item, open, onClose }) {
  if (!open || !item) return null;

  const meta = CSP_META[item.csp];
  const detail = getOptimizationDetail(item);

  const handleOpenConsole = () => {
    window.open(detail.consoleUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.55)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded shadow-xl"
        style={{ background: C.panel, border: `1px solid ${C.border}` }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="csp-opt-view-title"
      >
        <div className="flex items-start justify-between px-5 py-4 border-b sticky top-0 z-10" style={{ borderColor: C.border, background: C.panel }}>
          <div className="min-w-0 pr-4">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <CspBadge meta={meta} />
              <Pill tone={priorityTone(item.priority)} size="xs">{item.priority}</Pill>
              <span
                className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5"
                style={{ color: categoryColor(item.category), background: `${categoryColor(item.category)}18`, borderRadius: 2 }}
              >
                {item.category}
              </span>
              <Pill tone="info" size="xs">{detail.status}</Pill>
            </div>
            <h2 id="csp-opt-view-title" className="font-display text-lg font-semibold leading-snug" style={{ color: C.ink }}>
              {item.title}
            </h2>
            <div className="text-[10px] uppercase tracking-wider mt-1" style={{ color: C.inkMute }}>
              {meta.source} · {detail.region}
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 shrink-0" style={{ color: C.inkMute }} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Monthly savings', value: formatSavings(item.monthlySavings), tone: C.ok },
              { label: 'Annual savings', value: formatSavings(detail.annualSavings), tone: C.ok },
              { label: 'Confidence', value: `${item.confidence}%`, tone: C.ink },
              { label: 'Resources', value: String(item.resources), tone: C.ink },
            ].map((m) => (
              <div
                key={m.label}
                className="p-2.5"
                style={{ background: C.panelAlt, border: `1px solid ${C.border}`, borderRadius: 4 }}
              >
                <div className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
                  {m.label}
                </div>
                <div className="font-mono-num text-sm font-bold mt-0.5" style={{ color: m.tone }}>
                  {m.value}
                </div>
              </div>
            ))}
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: C.inkMute }}>
              CSP recommendation
            </div>
            <p className="text-[13px] leading-relaxed" style={{ color: C.inkSoft }}>
              {item.suggestion}
            </p>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: C.inkMute }}>
              Affected resources ({detail.affectedResources.length})
            </div>
            <div className="space-y-1 max-h-36 overflow-y-auto scrollbar-thin">
              {detail.affectedResources.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between text-[11px] px-2.5 py-1.5 font-mono-num"
                  style={{ background: C.panelAlt, border: `1px solid ${C.border}`, borderRadius: 3 }}
                >
                  <span style={{ color: C.ink }}>{r.name}</span>
                  <span style={{ color: C.inkMute }}>{r.region} · {r.current} → {r.recommended}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: C.inkMute }}>
              Implementation steps
            </div>
            <ol className="space-y-2">
              {detail.implementationSteps.map((step, i) => (
                <li key={i} className="flex gap-2 text-[12px]" style={{ color: C.inkSoft }}>
                  <span
                    className="shrink-0 w-5 h-5 flex items-center justify-center font-mono-num text-[10px] font-bold"
                    style={{ background: C.panelAlt, border: `1px solid ${C.border}`, borderRadius: 2, color: C.inkMute }}
                  >
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>

          <Panel padding="p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
                  {detail.consoleLabel}
                </div>
                <div className="text-[11px] font-mono-num truncate mt-0.5" style={{ color: C.inkSoft }} title={detail.consolePath}>
                  {detail.consolePath}
                </div>
              </div>
              <button
                type="button"
                onClick={handleOpenConsole}
                className="shrink-0 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-3 py-2 text-white"
                style={{ background: meta.color, borderRadius: 3 }}
              >
                Open in {meta.label}
                <ExternalLink size={12} />
              </button>
            </div>
          </Panel>
        </div>

        <div
          className="flex items-center justify-end gap-2 px-5 py-4 border-t sticky bottom-0"
          style={{ borderColor: C.border, background: C.panel }}
        >
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] font-semibold uppercase tracking-wider px-4 py-2"
            style={{ background: C.panelAlt, color: C.inkSoft, border: `1px solid ${C.border}`, borderRadius: 3 }}
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => {
              handleOpenConsole();
            }}
            className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-4 py-2 text-white"
            style={{ background: C.accent, borderRadius: 3 }}
          >
            <CheckCircle2 size={14} />
            View in {meta.label} console
          </button>
        </div>
      </div>
    </div>
  );
}
