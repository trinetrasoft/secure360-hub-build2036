import React, { useState, useEffect } from 'react';
import { X, Loader2, Plug } from 'lucide-react';
import { C } from '../../theme/colors';
import {
  getConnectSchema,
  emptyFormForSchema,
  validateConnectForm,
  buildConnectedConnector,
  DB_ENGINE_DEFAULT_PORTS,
} from '../../mock-data/connectorConnectSchemas';

const inputStyle = {
  background: C.panelAlt,
  border: `1px solid ${C.border}`,
  borderRadius: 3,
  color: C.ink,
};

function FieldInput({ field, value, onChange }) {
  const label = (
    <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
      {field.label}
      {field.required ? ' *' : ''}
    </span>
  );

  if (field.type === 'select') {
    return (
      <label className="flex flex-col gap-1">
        {label}
        <select
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          className="text-[13px] px-2 py-2 focus:outline-none w-full"
          style={inputStyle}
        >
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === 'textarea') {
    return (
      <label className="flex flex-col gap-1">
        {label}
        <textarea
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className="text-[12px] px-3 py-2 focus:outline-none w-full resize-none font-mono-num"
          style={inputStyle}
        />
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-1">
      {label}
      <input
        type={field.type === 'password' ? 'password' : 'text'}
        value={value}
        onChange={(e) => onChange(field.key, e.target.value)}
        placeholder={field.placeholder}
        className="text-[13px] px-3 py-2 focus:outline-none w-full font-mono-num"
        style={inputStyle}
        autoComplete={field.type === 'password' ? 'off' : undefined}
      />
    </label>
  );
}

export default function ConnectConnectorModal({ connector, open, onClose, onConnect }) {
  const schema = getConnectSchema(connector);
  const [form, setForm] = useState(() => emptyFormForSchema(schema));
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    if (open && connector) {
      const s = getConnectSchema(connector);
      setForm(emptyFormForSchema(s));
      setError('');
      setConnecting(false);
    }
  }, [open, connector?.id]);

  if (!open || !connector) return null;

  const set = (key, value) => {
    setError('');
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (connector?.id === 'asset-connector' && key === 'dbEngine' && DB_ENGINE_DEFAULT_PORTS[value]) {
        next.port = DB_ENGINE_DEFAULT_PORTS[value];
      }
      return next;
    });
  };

  const handleClose = () => {
    if (connecting) return;
    setError('');
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validateConnectForm(schema, form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setConnecting(true);
    setError('');

    await new Promise((r) => setTimeout(r, 1200));

    const connected = buildConnectedConnector(connector, form);
    onConnect(connected);
    setConnecting(false);
    onClose();
  };

  const showAccessKeys =
    schema.fields.some((f) => f.key === 'accessKeyId') && form.authMethod === 'Access keys';

  const fields = schema.fields.filter((f) => {
    if (f.key === 'accessKeyId' || f.key === 'secretAccessKey') return showAccessKeys;
    if (f.key === 'roleArn' || f.key === 'externalId') return form.authMethod !== 'Access keys';
    return true;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.55)' }}
      onClick={handleClose}
      role="presentation"
    >
      <div
        className={`w-full max-h-[90vh] overflow-y-auto rounded shadow-xl ${connector.id === 'asset-connector' ? 'max-w-xl' : 'max-w-lg'}`}
        style={{ background: C.panel, border: `1px solid ${C.border}` }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-connector-title"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 z-10" style={{ borderColor: C.border, background: C.panel }}>
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 flex items-center justify-center font-mono-num font-bold text-xs shrink-0"
              style={{ background: C.panelAlt, border: `1px solid ${C.border}`, borderRadius: 4 }}
            >
              {connector.name.substring(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.2em] font-semibold" style={{ color: C.inkMute }}>
                Connect integration
              </div>
              <h2 id="connect-connector-title" className="font-display text-lg font-semibold truncate" style={{ color: C.ink }}>
                {connector.name}
              </h2>
              <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
                {connector.cat}
              </div>
            </div>
          </div>
          <button type="button" onClick={handleClose} disabled={connecting} className="p-1.5 shrink-0" style={{ color: C.inkMute }} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {schema.hint && (
            <p className="text-[12px] leading-relaxed px-3 py-2 rounded" style={{ background: C.accentSoft, color: '#0f766e', border: `1px solid ${C.border}` }}>
              {schema.hint}
            </p>
          )}

          {error && (
            <p className="text-[13px] px-3 py-2 rounded" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: C.crit }}>
              {error}
            </p>
          )}

          {connecting ? (
            <div className="py-10 flex flex-col items-center gap-3" style={{ color: C.inkSoft }}>
              <Loader2 size={28} className="animate-spin" style={{ color: C.accent }} />
              <div className="text-sm font-medium" style={{ color: C.ink }}>
                Verifying credentials…
              </div>
              <div className="text-[11px]" style={{ color: C.inkMute }}>
                Testing connection to {connector.name}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {fields.map((field) => (
                <FieldInput
                  key={field.key}
                  field={field}
                  value={form[field.key] ?? ''}
                  onChange={set}
                />
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t sticky bottom-0" style={{ borderColor: C.border, background: C.panel }}>
            <button
              type="button"
              onClick={handleClose}
              disabled={connecting}
              className="text-[11px] font-semibold uppercase tracking-wider px-3 py-2 disabled:opacity-50"
              style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.inkSoft, borderRadius: 3 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={connecting}
              className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-4 py-2 text-white disabled:opacity-70"
              style={{ background: C.accent, borderRadius: 3 }}
            >
              {connecting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Connecting…
                </>
              ) : (
                <>
                  <Plug size={14} />
                  Connect
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
