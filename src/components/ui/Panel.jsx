import React from 'react';
import { C } from '../../theme/colors';

/** Standard surface container with consistent border + radius. */
export default function Panel({ children, className = '', style = {}, padding = 'p-5' }) {
  return (
    <div
      className={`${padding} ${className}`}
      style={{
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        boxShadow: C.shadowSoft,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
