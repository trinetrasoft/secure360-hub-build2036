import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import Panel from '../../components/ui/Panel';
import SectionHead from '../../components/ui/SectionHead';
import { C } from '../../theme/colors';

export default function BackupTrendChart({ data }) {
  return (
    <Panel padding="p-5">
      <SectionHead
        sub="30-day history"
        title="Policy compliance vs drift"
      />
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: C.inkMute }}
              tickLine={false}
              axisLine={{ stroke: C.border }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: C.inkMute, fontFamily: 'IBM Plex Mono' }}
              tickLine={false}
              axisLine={{ stroke: C.border }}
            />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 4,
                border: `1px solid ${C.border}`,
              }}
              labelStyle={{ fontFamily: 'IBM Plex Mono' }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area
              type="monotone"
              dataKey="success"
              name="Compliant"
              stackId="1"
              stroke={C.accent}
              fill={C.accent}
              fillOpacity={0.35}
            />
            <Area
              type="monotone"
              dataKey="failed"
              name="Non-compliant"
              stackId="1"
              stroke={C.crit}
              fill={C.crit}
              fillOpacity={0.4}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}
