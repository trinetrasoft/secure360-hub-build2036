import React from 'react';
import { Server, Building2, Lightbulb } from 'lucide-react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts';
import Panel from '../ui/Panel';
import Pill from '../ui/Pill';
import SectionHead from '../ui/SectionHead';
import { C } from '../../theme/colors';
import { formatSpend } from '../../mock-data/envScope';
import { formatSavings, priorityTone, categoryColor } from '../../mock-data/costOptimization';

export default function OnPremCostSection({ onPrem }) {
  if (!onPrem) return null;

  return (
    <>
      <Panel className="col-span-12">
        <SectionHead
          sub="Data centers · bare metal · VMware · enterprise DB licensing"
          title="On-prem overview"
          action={
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold" style={{ color: C.inkSoft }}>
              <Building2 size={12} />
              {onPrem.sharePct.toFixed(0)}% of platform spend
            </span>
          }
        />
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: 'On-prem MTD', value: formatSpend(onPrem.monthlySpend), tone: C.ink },
            { label: 'Hosts', value: onPrem.hostCount.toLocaleString(), tone: C.ink },
            { label: 'Databases', value: onPrem.dbCount.toLocaleString(), tone: C.ink },
            { label: 'Optimization potential', value: formatSavings(onPrem.potentialSavings), tone: C.ok },
          ].map((m) => (
            <div
              key={m.label}
              className="p-2.5"
              style={{ background: C.panelAlt, border: `1px solid ${C.border}`, borderRadius: 4 }}
            >
              <div className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
                {m.label}
              </div>
              <div className="font-mono-num text-lg font-bold mt-0.5" style={{ color: m.tone }}>
                {m.value}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="col-span-7">
        <SectionHead sub="Spend by data center · MTD" title="On-prem regional allocation" />
        <div className="space-y-2.5">
          {onPrem.datacenters.map((dc) => {
            const maxSpend = Math.max(...onPrem.datacenters.map((d) => d.spend));
            const barPct = maxSpend > 0 ? (dc.spend / maxSpend) * 100 : 0;
            return (
              <div key={dc.id} className="grid grid-cols-12 items-center gap-3 py-1.5">
                <div className="col-span-4 flex items-center gap-2 min-w-0">
                  <Server size={12} style={{ color: C.inkMute }} />
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate" style={{ color: C.ink }} title={dc.name}>
                      {dc.name}
                    </div>
                    <div className="text-[10px]" style={{ color: C.inkMute }}>{dc.region}</div>
                  </div>
                </div>
                <div className="col-span-2 font-mono-num text-xs" style={{ color: C.inkSoft }}>
                  {dc.dbs} dbs
                </div>
                <div className="col-span-4 flex items-center gap-2">
                  <div className="flex-1 h-1.5" style={{ background: C.panelAlt, borderRadius: 2 }}>
                    <div
                      className="h-full"
                      style={{ width: `${barPct}%`, background: '#64748b', borderRadius: 2 }}
                    />
                  </div>
                  <span className="font-mono-num text-xs w-12 text-right" style={{ color: C.ink }}>
                    ${(dc.spend / 1000).toFixed(0)}K
                  </span>
                </div>
                <div className="col-span-2 flex justify-end">
                  <Pill tone="neutral">{dc.pct.toFixed(1)}%</Pill>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel className="col-span-5">
        <SectionHead
          sub="On-prem breakdown · MTD"
          title={`${formatSpend(onPrem.monthlySpend)} on-prem spend`}
          action={<Pill tone="warn">+{onPrem.forecastDelta}% vs forecast</Pill>}
        />
        <ResponsiveContainer width="100%" height={170}>
          <PieChart>
            <Pie data={onPrem.breakdown} dataKey="value" innerRadius={45} outerRadius={70} paddingAngle={2}>
              {onPrem.breakdown.map((e, i) => (
                <Cell key={i} fill={e.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 3, fontSize: 11 }}
              formatter={(v) => `$${(v / 1000).toFixed(0)}K`}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-1 gap-y-1.5 mt-1">
          {onPrem.breakdown.map((c) => (
            <div key={c.name} className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-1.5 h-1.5 shrink-0" style={{ background: c.color }} />
                <span className="truncate" style={{ color: C.inkSoft }}>{c.name}</span>
              </div>
              <span className="font-mono-num font-semibold shrink-0 ml-2" style={{ color: C.ink }}>
                ${(c.value / 1000).toFixed(0)}K
              </span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="col-span-12">
        <SectionHead
          sub="Datacenter & licensing optimization"
          title="On-prem cost optimization"
          action={
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold" style={{ color: C.ok }}>
              <Lightbulb size={12} />
              {formatSavings(onPrem.potentialSavings)}/mo potential
            </span>
          }
        />
        <div className="grid grid-cols-2 gap-3">
          {onPrem.optimizations.map((item) => (
            <div
              key={item.id}
              className="p-3 flex flex-col gap-2"
              style={{ background: C.panelAlt, border: `1px solid ${C.border}`, borderRadius: 4 }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Pill tone={priorityTone(item.priority)} size="xs">{item.priority}</Pill>
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
              <div className="text-sm font-medium" style={{ color: C.ink }}>{item.title}</div>
              <p className="text-[11px] leading-relaxed" style={{ color: C.inkSoft }}>{item.suggestion}</p>
            </div>
          ))}
        </div>
      </Panel>
    </>
  );
}
