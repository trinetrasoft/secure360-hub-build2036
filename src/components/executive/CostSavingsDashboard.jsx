import React from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell,
} from 'recharts';
import { DollarSign, TrendingDown, Lightbulb, PiggyBank } from 'lucide-react';
import Panel from '../ui/Panel';
import Pill from '../ui/Pill';
import SectionHead from '../ui/SectionHead';
import { C } from '../../theme/colors';
import { formatSpend } from '../../mock-data/envScope';
import { formatSavings } from '../../mock-data/costOptimization';

function SummaryMetric({ label, value, sub, tone = C.ink }) {
  return (
    <div
      className="p-3"
      style={{ background: C.panelAlt, border: `1px solid ${C.border}`, borderRadius: 4 }}
    >
      <div className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
        {label}
      </div>
      <div className="font-mono-num text-xl font-bold mt-0.5" style={{ color: tone }}>
        {value}
      </div>
      {sub && <div className="text-[10px] mt-0.5" style={{ color: C.inkSoft }}>{sub}</div>}
    </div>
  );
}

export default function CostSavingsDashboard({ savings, onViewCostTab }) {
  if (!savings) return null;

  return (
    <Panel className="col-span-12">
      <SectionHead
        sub="Realized savings · CSP potential · AI cost avoidance"
        title="Cost savings dashboard"
        action={
          onViewCostTab ? (
            <button
              type="button"
              onClick={onViewCostTab}
              className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 hover:opacity-80"
              style={{ color: C.accent }}
            >
              Open Cost tab →
            </button>
          ) : (
            <Pill tone="ok">{savings.savingsRate.toFixed(1)}% of MTD spend</Pill>
          )
        }
      />

      <div className="grid grid-cols-4 gap-3 mb-4">
        <SummaryMetric
          label="Saved MTD"
          value={formatSpend(savings.mtdRealized)}
          sub="Realized this month"
          tone={C.ok}
        />
        <SummaryMetric
          label="Saved YTD"
          value={formatSpend(savings.ytdRealized)}
          sub="Cumulative fiscal YTD"
          tone={C.ok}
        />
        <SummaryMetric
          label="CSP potential"
          value={formatSavings(savings.mtdPotential)}
          sub={`${savings.recommendationCount} recommendations`}
          tone={C.warn}
        />
        <SummaryMetric
          label="Total opportunity"
          value={formatSpend(savings.totalOpportunity)}
          sub={`${savings.captureRate.toFixed(0)}% captured · spend ${formatSpend(savings.monthlySpend)}`}
          tone={C.ink}
        />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-7">
          <div className="flex items-center gap-2 mb-2">
            <PiggyBank size={14} style={{ color: C.accent }} />
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
              MTD savings breakdown
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={savings.breakdown} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={C.border} strokeDasharray="2 4" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${Math.round(v / 1000)}K`} />
              <YAxis type="category" dataKey="name" width={108} tick={{ fontSize: 10, fill: C.ink }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 11 }}
                formatter={(v) => [formatSpend(v), 'Saved']}
              />
              <Bar dataKey="amount" name="Saved MTD" radius={[0, 2, 2, 0]} barSize={14}>
                {savings.breakdown.map((b) => (
                  <Cell key={b.name} fill={b.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="col-span-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown size={14} style={{ color: C.ok }} />
            <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
              30-day savings trend
            </span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={savings.trend} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 9, fill: C.inkMute }} axisLine={false} tickLine={false} interval={6} />
              <YAxis tick={{ fontSize: 10, fill: C.inkMute }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `${Math.round(v / 1000)}K`} />
              <Tooltip contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 9 }} />
              <Line type="monotone" dataKey="realized" name="Daily realized" stroke={C.ok} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="cumulative" name="Cumulative" stroke={C.accent} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb size={14} style={{ color: C.warn }} />
          <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
            Savings highlights
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {savings.highlights.map((h) => (
            <div
              key={h.id}
              className="flex items-center justify-between gap-3 p-3"
              style={{ background: C.panelAlt, border: `1px solid ${C.border}`, borderRadius: 4 }}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <Pill tone={h.tone === 'potential' ? 'warn' : 'ok'} size="xs">
                    {h.tone === 'potential' ? 'potential' : 'realized'}
                  </Pill>
                  <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
                    {h.source}
                  </span>
                </div>
                <div className="text-sm font-medium truncate" style={{ color: C.ink }} title={h.title}>
                  {h.title}
                </div>
              </div>
              <div className="font-mono-num text-sm font-bold shrink-0" style={{ color: h.tone === 'potential' ? C.warn : C.ok }}>
                {formatSpend(h.amount)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className="mt-3 flex items-center justify-between text-[11px] px-3 py-2 rounded"
        style={{ background: C.accentSoft, color: '#0f766e', border: `1px solid ${C.border}` }}
      >
        <span className="flex items-center gap-1.5">
          <DollarSign size={14} />
          You are saving <strong>{formatSpend(savings.mtdRealized)}</strong> this month ({savings.savingsRate.toFixed(1)}% of {formatSpend(savings.monthlySpend)} spend).
        </span>
        {savings.mtdPotential > 0 && (
          <span>
            Additional <strong>{formatSavings(savings.mtdPotential)}/mo</strong> available from CSP recommendations.
          </span>
        )}
      </div>
    </Panel>
  );
}
