import React from 'react';
import { C } from '../../theme/colors';

/** Section title with eyebrow label and optional right-aligned action. */
export default function SectionHead({ title, sub, action }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-4">
      <div>
        <div
          className="text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ color: C.inkMute }}
        >
          {sub}
        </div>
        <div
          className="font-display text-[1.05rem] font-semibold mt-1"
          style={{ color: C.ink }}
        >
          {title}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
