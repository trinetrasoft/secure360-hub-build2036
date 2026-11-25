import React from 'react';
import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import Panel from '../../components/ui/Panel';
import { C } from '../../theme/colors';

function ComplianceGauge({ label, value, target, trend, sublabel }) {
  const statusColor = value >= target ? C.ok : value >= target - 3 ? C.warn : C.crit;
  const statusLabel =
    value >= target ? 'On target' : value >= target - 3 ? 'At risk' : 'Below target';
  const data = [{ name: 'score', value, fill: statusColor }];
  const trendUp = trend >= 0;
  const trendGood = trendUp;

  return (
    <Panel className="flex-1" padding="p-5">
      <div
        className="text-[10px] uppercase tracking-[0.16em] font-semibold mb-3"
        style={{ color: C.inkMute }}
      >
        {label}
      </div>

      <div className="mx-auto w-full max-w-[280px]">
        {/* Arc gauge — bottom-aligned so open space sits below */}
        <div className="h-[108px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              cx="50%"
              cy="100%"
              innerRadius="68%"
              outerRadius="100%"
              startAngle={180}
              endAngle={0}
              data={data}
              barSize={14}
            >
              <RadialBar
                background={{ fill: C.panelSoft }}
                dataKey="value"
                cornerRadius={6}
                max={100}
              />
            </RadialBarChart>
          </ResponsiveContainer>
        </div>

        {/* Metrics below the arc — never layered on the bar */}
        <div className="text-center pt-2">
          <span
            className="font-mono-num text-4xl font-bold tabular-nums leading-none block"
            style={{ color: C.ink }}
          >
            {value}%
          </span>
          <span
            className="mt-2 inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
            style={{ background: `${statusColor}18`, color: statusColor }}
          >
            {statusLabel}
          </span>
        </div>
      </div>

      <p className="text-center text-[11px] mt-3 px-2" style={{ color: C.inkMute }}>
        {sublabel}
      </p>

      <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t" style={{ borderColor: C.border }}>
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
            Target
          </div>
          <div className="font-mono-num text-sm font-semibold mt-0.5" style={{ color: C.ink }}>
            ≥ {target}%
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
            vs last week
          </div>
          <div
            className="flex items-center gap-1 font-mono-num text-sm font-semibold mt-0.5"
            style={{ color: trendGood ? C.ok : C.crit }}
          >
            {trendUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(trend)}%
          </div>
        </div>
      </div>
    </Panel>
  );
}

export default function ComplianceGauges({ rtoPct, rpoPct, rtoTarget, rpoTarget, rtoTrend, rpoTrend }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <ComplianceGauge
        label="Policy SLA compliance"
        value={rtoPct}
        target={rtoTarget}
        trend={rtoTrend}
        sublabel="Controls meeting remediation SLA"
      />
      <ComplianceGauge
        label="Evidence coverage"
        value={rpoPct}
        target={rpoTarget}
        trend={rpoTrend}
        sublabel="Controls with current audit evidence"
      />
    </div>
  );
}
