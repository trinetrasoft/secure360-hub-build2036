import React from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import Panel from './Panel';
import { C } from '../../theme/colors';

/**
 * KPI metric card with optional sparkline and trend delta.
 * Direction-aware: for crit/warn tones, "up" deltas are bad.
 * Footer row is always reserved so cards align in a grid.
 */
export default function Kpi({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  tone = 'neutral',
  icon: Icon,
  sparkData,
  size = 'default',
}) {
  const large = size === 'large';
  const toneColor =
    tone === 'ok' ? C.ok : tone === 'warn' ? C.warn : tone === 'crit' ? C.crit : C.ink;
  const deltaPositive = (delta || 0) >= 0;
  const goodWhenUp = tone !== 'crit' && tone !== 'warn';
  const deltaGood = goodWhenUp ? deltaPositive : !deltaPositive;

  return (
    <Panel
      padding={large ? 'p-5' : 'p-4'}
      className={`h-full flex flex-col w-full ${large ? 'min-h-[148px]' : 'min-h-[132px]'}`}
      style={{
        background: large ? C.panel : C.panel,
      }}
    >
      <div className={`flex items-start justify-between shrink-0 ${large ? 'mb-4' : 'mb-3'}`}>
        <div
          className={`uppercase tracking-[0.16em] font-semibold ${large ? 'text-[11px]' : 'text-[10px]'}`}
          style={{ color: C.inkMute }}
        >
          {label}
        </div>
        {Icon && (
          <div
            className="p-2 rounded-md"
            style={{ background: C.panelSoft, border: `1px solid ${C.border}` }}
          >
            <Icon size={large ? 18 : 14} style={{ color: C.inkMute }} strokeWidth={1.5} />
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-2 shrink-0">
        <span
          className={`font-mono-num font-semibold tabular-nums leading-none ${large ? 'text-4xl' : 'text-3xl'}`}
          style={{ color: toneColor }}
        >
          {value}
        </span>
        {unit && (
          <span className={`font-mono-num ${large ? 'text-sm' : 'text-xs'}`} style={{ color: C.inkMute }}>
            {unit}
          </span>
        )}
      </div>

      <div
        className="mt-auto pt-3 min-h-[28px] flex items-center justify-between gap-2"
        style={{ borderTop: `1px solid ${C.border}`, marginTop: 18 }}
      >
        <div className="flex-1 min-w-0">
          {delta !== undefined ? (
            <div
              className={`flex items-center gap-1 font-mono-num whitespace-nowrap ${large ? 'text-xs' : 'text-[11px]'}`}
              style={{ color: deltaGood ? C.ok : C.crit }}
            >
              {deltaPositive ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
              {Math.abs(delta)}
              {deltaLabel || '%'}
              <span style={{ color: C.inkMute }} className="ml-1">
                vs 7d
              </span>
            </div>
          ) : (
            <span className="inline-block h-[11px]" aria-hidden />
          )}
        </div>
        <div className={`shrink-0 flex items-center justify-end ${large ? 'w-24 h-7' : 'w-20 h-6'}`}>
          {sparkData ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={toneColor}
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
