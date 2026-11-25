import React, { useMemo, useState } from 'react';
import { FileCheck } from 'lucide-react';
import Panel from '../../components/ui/Panel';
import Pill from '../../components/ui/Pill';
import { C } from '../../theme/colors';
import { REGIONS } from '../../mock-data/helpers';
import { POLICY_STATUSES, POLICY_CONTROL_TYPES } from '../../mock-data/backup';

const STATUS_FILTERS = ['All', ...POLICY_STATUSES];
const TYPE_FILTERS = ['All', ...POLICY_CONTROL_TYPES];

const statusTone = {
  COMPLIANT: 'ok',
  NON_COMPLIANT: 'crit',
  IN_PROGRESS: 'info',
  EXPIRED: 'neutral',
};

function MetCell({ met }) {
  return (
    <span className="font-mono-num text-sm font-bold" style={{ color: met ? C.ok : C.crit }}>
      {met ? '✓' : '✗'}
    </span>
  );
}

export default function BackupJobsTable({ jobs, onInitiateRestore }) {
  const [statusFilter, setStatusFilter] = useState('All');
  const [regionFilter, setRegionFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (statusFilter !== 'All' && j.status !== statusFilter) return false;
      if (regionFilter !== 'All' && j.region !== regionFilter) return false;
      if (typeFilter !== 'All' && j.backup_type !== typeFilter) return false;
      return true;
    });
  }, [jobs, statusFilter, regionFilter, typeFilter]);

  return (
    <Panel padding="p-0" className="overflow-hidden">
      <div className="px-5 py-3 border-b flex flex-wrap items-center gap-3" style={{ borderColor: C.border }}>
        <div className="font-display font-semibold text-sm" style={{ color: C.ink }}>
          Policy controls · {filtered.length} shown
        </div>
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="azure-select text-[11px] px-2.5 py-1.5"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>Status: {s}</option>
            ))}
          </select>
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="azure-select text-[11px] px-2.5 py-1.5"
          >
            <option value="All">Region: All</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="azure-select text-[11px] px-2.5 py-1.5"
          >
            {TYPE_FILTERS.map((t) => (
              <option key={t} value={t}>Control: {t}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="max-h-[480px] overflow-auto scrollbar-thin">
        <table className="azure-table w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-white border-b" style={{ borderColor: C.border }}>
            <tr>
              {[
                'Asset',
                'Policy',
                'Domain',
                'Region',
                'Control type',
                'Status',
                'Evaluated',
                'Duration',
                'Coverage',
                'Drift',
                'Last audit',
                'SLA',
                'Evidence',
                'Actions',
              ].map((col) => (
                <th
                  key={col}
                  className="px-3 py-2.5 font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap"
                  style={{ color: C.inkMute }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((job) => (
              <tr key={job.id} className="border-b" style={{ borderColor: C.border }}>
                <td className="px-3 py-2.5 font-mono-num font-semibold whitespace-nowrap" style={{ color: C.ink }}>
                  {job.db_name}
                </td>
                <td className="px-3 py-2.5 max-w-[180px] truncate" style={{ color: C.inkSoft }} title={job.policy_name}>
                  {job.policy_name}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: C.inkSoft }}>{job.db_type}</td>
                <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: C.inkSoft }}>{job.region}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className="text-[10px] font-mono-num" style={{ color: C.inkMute }}>{job.backup_type}</span>
                </td>
                <td className="px-3 py-2.5">
                  <Pill tone={statusTone[job.status]} size="xs">{job.status}</Pill>
                </td>
                <td className="px-3 py-2.5 font-mono-num whitespace-nowrap" style={{ color: C.inkSoft }}>{job.started_at}</td>
                <td className="px-3 py-2.5 font-mono-num whitespace-nowrap" style={{ color: C.inkSoft }}>
                  {job.duration_mins != null ? `${job.duration_mins}m` : '—'}
                </td>
                <td className="px-3 py-2.5 font-mono-num whitespace-nowrap" style={{ color: C.inkSoft }}>
                  {job.coverage_pct != null ? `${job.coverage_pct}%` : '—'}
                </td>
                <td className="px-3 py-2.5 font-mono-num whitespace-nowrap" style={{ color: job.lag_mins > 5 ? C.warn : C.inkSoft }}>
                  {job.lag_mins}d
                </td>
                <td className="px-3 py-2.5 font-mono-num whitespace-nowrap" style={{ color: C.inkSoft }}>{job.last_restore_test}</td>
                <td className="px-3 py-2.5 text-center"><MetCell met={job.rto_met} /></td>
                <td className="px-3 py-2.5 text-center"><MetCell met={job.rpo_met} /></td>
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => onInitiateRestore(job)}
                    className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2.5 py-1.5 whitespace-nowrap"
                    style={{ background: C.accentSoft, color: C.accentHover, borderRadius: 6, border: `1px solid ${C.borderStrong}` }}
                  >
                    <FileCheck size={10} />
                    Remediate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
