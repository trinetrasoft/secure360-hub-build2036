import React, { useState } from 'react';
import { Lightbulb, ChevronRight, Eye } from 'lucide-react';
import CostOptimizationViewModal from './CostOptimizationViewModal';
import Panel from '../ui/Panel';
import Pill from '../ui/Pill';
import SectionHead from '../ui/SectionHead';
import { C } from '../../theme/colors';
import {
  groupByCsp,
  formatSavings,
  getCspOptimizationSummary,
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

function OptimizationCard({ item, meta, onView }) {
  return (
    <div
      className="p-3 flex flex-col gap-2 h-full"
      style={{ background: C.panelAlt, border: `1px solid ${C.border}`, borderRadius: 4 }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <Pill tone={priorityTone(item.priority)} size="xs">
            {item.priority}
          </Pill>
          <span
            className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5"
            style={{ color: categoryColor(item.category), background: `${categoryColor(item.category)}18`, borderRadius: 2 }}
          >
            {item.category}
          </span>
        </div>
        <span className="font-mono-num text-xs font-bold shrink-0" style={{ color: C.ok }}>
          {formatSavings(item.monthlySavings)}/mo
        </span>
      </div>
      <div className="text-sm font-medium leading-snug" style={{ color: C.ink }}>
        {item.title}
      </div>
      <p className="text-[11px] leading-relaxed flex-1" style={{ color: C.inkSoft }}>
        {item.suggestion}
      </p>
      <div className="flex items-center justify-between gap-2 text-[10px] pt-2 mt-1" style={{ borderTop: `1px solid ${C.border}`, color: C.inkMute }}>
        <span>
          {item.resources} resources · {item.effort} effort · {item.confidence}% match
        </span>
        <button
          type="button"
          onClick={() => onView?.(item)}
          className="flex items-center gap-1 font-semibold uppercase tracking-wider px-2.5 py-1.5 shrink-0 hover:opacity-90 transition-opacity"
          style={{ background: meta.color, color: '#fff', borderRadius: 3 }}
        >
          <Eye size={11} />
          View
        </button>
      </div>
    </div>
  );
}

export default function CostOptimizationPanel({ recommendations, scopeLabel = 'Cloud' }) {
  const [activeCsp, setActiveCsp] = useState('All');
  const [viewItem, setViewItem] = useState(null);
  const groups = groupByCsp(recommendations);
  const summary = getCspOptimizationSummary(recommendations);

  const filtered =
    activeCsp === 'All'
      ? recommendations
      : recommendations.filter((r) => r.csp === activeCsp);

  const cspTabs = ['All', 'AWS', 'Azure', 'GCP'];

  return (
    <Panel className="col-span-12">
      <SectionHead
        sub={
          scopeLabel
            ? `${scopeLabel} · CSP-native recommendations · rightsizing, RI/CUD, storage & idle resources`
            : 'CSP-native recommendations · rightsizing, RI/CUD, storage & idle resources'
        }
        title={scopeLabel ? `${scopeLabel} cost optimization` : 'Cost optimization'}
        action={
          <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold" style={{ color: C.ok }}>
            <Lightbulb size={12} />
            {formatSavings(summary.monthlySavings)}/mo potential
          </span>
        }
      />

      <div
        className="grid grid-cols-4 gap-3 mb-4 p-3"
        style={{ background: C.panelAlt, border: `1px solid ${C.border}`, borderRadius: 4 }}
      >
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
            Potential savings
          </div>
          <div className="font-mono-num text-lg font-bold mt-0.5" style={{ color: C.ok }}>
            {formatSavings(summary.monthlySavings)}
            <span className="text-xs font-medium ml-1" style={{ color: C.inkSoft }}>
              /month
            </span>
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
            Recommendations
          </div>
          <div className="font-mono-num text-lg font-bold mt-0.5" style={{ color: C.ink }}>
            {summary.count}
          </div>
        </div>
        <div className="col-span-2">
          <div className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: C.inkMute }}>
            By cloud provider
          </div>
          <div className="flex flex-wrap gap-2">
            {groups.map(({ csp, meta, items, savings }) => (
              <div
                key={csp}
                className="flex items-center gap-2 px-2 py-1"
                style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3 }}
              >
                <CspBadge meta={meta} />
                <span className="text-[11px]" style={{ color: C.inkSoft }}>
                  {items.length} recs
                </span>
                <span className="font-mono-num text-[11px] font-semibold" style={{ color: C.ok }}>
                  {formatSavings(savings)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex gap-1 mb-4">
        {cspTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveCsp(tab)}
            className="text-[10px] font-semibold uppercase tracking-wider px-3 py-1.5 transition-colors"
            style={{
              background: activeCsp === tab ? C.ink : C.panelAlt,
              color: activeCsp === tab ? '#fff' : C.inkSoft,
              border: `1px solid ${activeCsp === tab ? C.ink : C.border}`,
              borderRadius: 3,
            }}
          >
            {tab}
            {tab !== 'All' && (
              <span className="ml-1 opacity-70">
                ({recommendations.filter((r) => r.csp === tab).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {activeCsp === 'All' ? (
        <div className="space-y-5">
          {groups.map(({ csp, meta, items }) =>
            items.length > 0 ? (
              <div key={csp}>
                <div className="flex items-center gap-2 mb-2">
                  <CspBadge meta={meta} />
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: C.inkMute }}>
                    {meta.source}
                  </span>
                  <ChevronRight size={12} style={{ color: C.inkMute }} />
                  <span className="text-[11px] font-mono-num font-semibold ml-auto" style={{ color: C.ok }}>
                    {formatSavings(items.reduce((s, r) => s + r.monthlySavings, 0))}/mo
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {items.map((item) => (
                    <OptimizationCard key={item.id} item={item} meta={meta} onView={setViewItem} />
                  ))}
                </div>
              </div>
            ) : null
          )}
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <CspBadge meta={groups.find((g) => g.csp === activeCsp)?.meta} />
            <span className="text-[10px] uppercase tracking-wider" style={{ color: C.inkMute }}>
              {groups.find((g) => g.csp === activeCsp)?.meta?.source}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((item) => (
              <OptimizationCard
                key={item.id}
                item={item}
                meta={groups.find((g) => g.csp === activeCsp).meta}
                onView={setViewItem}
              />
            ))}
          </div>
        </div>
      )}

      <CostOptimizationViewModal
        item={viewItem}
        open={Boolean(viewItem)}
        onClose={() => setViewItem(null)}
      />
    </Panel>
  );
}
