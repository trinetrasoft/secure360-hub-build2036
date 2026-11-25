import React, { useState } from 'react';
import { X } from 'lucide-react';
import { C } from '../../theme/colors';

export default function RestoreModal({ job, onClose, onConfirm }) {
  const [targetEnv, setTargetEnv] = useState('staging');
  const [pointInTime, setPointInTime] = useState('');
  const [reason, setReason] = useState('');

  if (!job) return null;

  const handleConfirm = () => {
    onConfirm(job.db_name);
    onClose();
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center min-h-full p-4"
      style={{ background: 'rgba(15, 23, 42, 0.45)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="restore-modal-title"
    >
      <div
        className="w-full max-w-lg bg-white rounded-xl border border-gray-200 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b border-gray-200"
        >
          <h2 id="restore-modal-title" className="font-display text-lg font-semibold" style={{ color: C.ink }}>
            Remediate policy control
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100"
            style={{ color: C.inkMute }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
                Asset
              </div>
              <div className="font-mono-num font-semibold mt-0.5" style={{ color: C.ink }}>
                {job.db_name}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: C.inkMute }}>
                Region · Type
              </div>
              <div className="mt-0.5" style={{ color: C.inkSoft }}>
                {job.region} · {job.db_type}
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="restore-env"
              className="block text-[11px] uppercase tracking-wide font-semibold mb-1.5"
              style={{ color: C.inkSoft }}
            >
              Target environment
            </label>
            <select
              id="restore-env"
              value={targetEnv}
              onChange={(e) => setTargetEnv(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2"
              style={{ color: C.ink }}
            >
              <option value="staging">Staging</option>
              <option value="dev">Development</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="restore-pit"
              className="block text-[11px] uppercase tracking-wide font-semibold mb-1.5"
              style={{ color: C.inkSoft }}
            >
              Point-in-time
            </label>
            <input
              id="restore-pit"
              type="datetime-local"
              value={pointInTime}
              onChange={(e) => setPointInTime(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono-num border border-gray-200 rounded-lg focus:outline-none focus:ring-2"
            />
          </div>

          <div>
            <label
              htmlFor="restore-reason"
              className="block text-[11px] uppercase tracking-wide font-semibold mb-1.5"
              style={{ color: C.inkSoft }}
            >
              Restore reason
            </label>
            <textarea
              id="restore-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe the recovery scenario…"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2"
              style={{ color: C.ink }}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50"
            style={{ color: C.inkSoft }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-semibold text-white rounded-lg"
            style={{ background: C.accent }}
          >
            Confirm Restore
          </button>
        </div>
      </div>
    </div>
  );
}
