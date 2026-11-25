import React from 'react';
import { C } from '../../theme/colors';

/** Horizontal underlined tab bar. */
export default function TabBar({ tabs, active, onChange, size = 'default' }) {
  const large = size === 'large';

  return (
    <div
      className="flex items-stretch gap-1 border-b overflow-x-auto scrollbar-thin"
      style={{ borderColor: C.border }}
    >
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={
            large
              ? 'px-5 py-3 min-h-[46px] flex items-center text-sm font-semibold uppercase tracking-wider transition-colors relative whitespace-nowrap rounded-t-md'
              : 'px-3.5 py-2.5 min-h-[38px] flex items-center text-[11px] font-semibold uppercase tracking-wider transition-colors relative whitespace-nowrap rounded-t-md'
          }
          style={{
            color: active === t ? C.ink : C.inkMute,
            background: active === t ? C.panel : 'transparent',
            borderBottom: active === t ? `2px solid ${C.accent}` : '2px solid transparent',
            boxShadow: active === t ? `inset 0 1px 0 ${C.accent}` : 'none',
            marginBottom: -1,
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
