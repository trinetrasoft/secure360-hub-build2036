import React from 'react';
import { C } from '../../theme/colors';

const tones = {
  ok:      { bg: '#dff6dd', fg: '#0f6c0f', border: '#b7dfb1' },
  warn:    { bg: '#fff4ce', fg: '#8a4b12', border: '#f0d788' },
  crit:    { bg: '#fde7e9', fg: '#a4262c', border: '#f1b1b8' },
  info:    { bg: '#deecf9', fg: '#004578', border: '#b3d7f2' },
  neutral: { bg: '#f3f7fb', fg: '#42526b', border: '#d7e3f1' },
  accent:  { bg: C.accentSoft, fg: C.accentHover, border: '#b6d6f2' },
  p1:      { bg: '#fde7e9', fg: '#a4262c', border: '#f1b1b8' },
  p2:      { bg: '#fff4ce', fg: '#8a4b12', border: '#f0d788' },
  p3:      { bg: '#ede6ff', fg: '#5c2e91', border: '#d1c0f6' },
};

/**
 * Compact status/severity pill.
 * tone: ok | warn | crit | info | neutral | accent | p1 | p2 | p3
 * size: xs | sm
 */
export default function Pill({ children, tone = 'neutral', size = 'sm' }) {
  const t = tones[tone] || tones.neutral;
  const sz = size === 'xs' ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5';
  return (
    <span
      className={`${sz} font-mono-num font-semibold uppercase tracking-wider inline-flex items-center`}
      style={{ background: t.bg, color: t.fg, borderRadius: 999, border: `1px solid ${t.border}` }}
    >
      {children}
    </span>
  );
}
