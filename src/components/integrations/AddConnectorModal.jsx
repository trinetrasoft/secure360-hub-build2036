import React, { useState } from 'react';
import { X } from 'lucide-react';
import { C } from '../../theme/colors';

export const CONNECTOR_CATEGORIES = [
  'ITAM',
  'ITSM',
  'Monitoring',
  'Security',
  'SIEM',
  'Cloud',
  'Observability',
  'APM',
  'Visualization',
  'Database',
  'Metrics',
  'Workflow',
  'EDR',
  'CSPM',
  'CNAPP',
  'Vuln Mgmt',
  'CMDB',
  'Other',
];

const inputStyle = {
  background: C.panelAlt,
  border: `1px solid ${C.border}`,
  borderRadius: 3,
  color: C.ink,
};

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32) || 'connector';
}

export function buildConnectorFromForm(form) {
  const lag = Math.max(1, Math.min(120, Number(form.lagSeconds) || 8));
  const records = Math.max(0, Number(form.records) || 0);
  const baseId = slugify(form.name);

  return {
    id: `${baseId}-${Date.now().toString(36)}`,
    name: form.name.trim(),
    cat: form.category,
    status: form.status,
    endpoint: form.endpoint.trim(),
    description: form.description.trim(),
    lastSync: 'Just now',
    records,
    lag,
  };
}

const EMPTY_FORM = {
  name: '',
  category: 'Monitoring',
  status: 'connected',
  endpoint: '',
  description: '',
  records: '',
  lagSeconds: '8',
};

export default function AddConnectorModal({ open, onClose, onAdd }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  if (!open) return null;

  const set = (key, value) => {
    setError('');
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Connector name is required.');
      return;
    }
    if (!form.category) {
      setError('Select a category.');
      return;
    }
    onAdd(buildConnectorFromForm(form));
    setForm(EMPTY_FORM);
    setError('');
    onClose();
  };

  const handleClose = () => {
    setForm(EMPTY_FORM);
    setError('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.55)' }}
      onClick={handleClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded shadow-xl"
        style={{ background: C.panel, border: `1px solid ${C.border}` }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-connector-title"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.border }}>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] font-semibold" style={{ color: C.inkMute }}>
              Data integration layer
            </div>
            <h2 id="add-connector-title" className="font-display text-lg font-semibold" style={{ color: C.ink }}>
              Add connector
            </h2>
          </div>
          <button type="button" onClick={handleClose} className="p-1.5" style={{ color: C.inkMute }} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {error && (
            <p className="text-[13px] px-3 py-2 rounded" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: C.crit }}>
              {error}
            </p>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
              Connector name *
            </span>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. ServiceNow CMDB"
              className="text-[13px] px-3 py-2 focus:outline-none w-full"
              style={inputStyle}
              autoFocus
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
                Category *
              </span>
              <select
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
                className="text-[13px] px-2 py-2 focus:outline-none w-full"
                style={inputStyle}
              >
                {CONNECTOR_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
                Initial status
              </span>
              <select
                value={form.status}
                onChange={(e) => set('status', e.target.value)}
                className="text-[13px] px-2 py-2 focus:outline-none w-full"
                style={inputStyle}
              >
                <option value="connected">Connected</option>
                <option value="degraded">Degraded</option>
                <option value="error">Error</option>
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
              Endpoint URL
            </span>
            <input
              value={form.endpoint}
              onChange={(e) => set('endpoint', e.target.value)}
              placeholder="https://api.example.com/v1"
              className="text-[13px] px-3 py-2 focus:outline-none w-full font-mono-num"
              style={inputStyle}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
              Description
            </span>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="What data does this connector ingest?"
              rows={2}
              className="text-[13px] px-3 py-2 focus:outline-none w-full resize-none"
              style={inputStyle}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
                Records (initial)
              </span>
              <input
                type="number"
                min={0}
                value={form.records}
                onChange={(e) => set('records', e.target.value)}
                placeholder="0"
                className="text-[13px] px-3 py-2 focus:outline-none w-full font-mono-num"
                style={inputStyle}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
                Lag (seconds)
              </span>
              <input
                type="number"
                min={1}
                max={300}
                value={form.lagSeconds}
                onChange={(e) => set('lagSeconds', e.target.value)}
                className="text-[13px] px-3 py-2 focus:outline-none w-full font-mono-num"
                style={inputStyle}
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: C.border }}>
            <button
              type="button"
              onClick={handleClose}
              className="text-[11px] font-semibold uppercase tracking-wider px-3 py-2"
              style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.inkSoft, borderRadius: 3 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="text-[11px] font-semibold uppercase tracking-wider px-4 py-2 text-white"
              style={{ background: C.accent, borderRadius: 3 }}
            >
              Add connector
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
