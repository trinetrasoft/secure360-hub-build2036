import React, { useState, useMemo } from 'react';
import { FileCheck, AlertTriangle, Clock, Shield } from 'lucide-react';
import Kpi from '../components/ui/Kpi';
import { C } from '../theme/colors';
import { RTO_TARGET_PCT, RPO_TARGET_PCT } from '../mock-data/backup';
import { ALL_ENVS, getBackupStatsForEnv, getBackupTrendForEnv } from '../mock-data/envScope';
import ComplianceGauges from './backup/ComplianceGauges';
import BackupJobsTable from './backup/BackupJobsTable';
import RestoreModal from './backup/RestoreModal';
import BackupTrendChart from './backup/BackupTrendChart';

export default function BackupRecovery({ env = ALL_ENVS }) {
  const [restoreJob, setRestoreJob] = useState(null);
  const [toast, setToast] = useState(null);

  const backupStats = useMemo(() => getBackupStatsForEnv(env), [env]);
  const backupTrend = useMemo(() => getBackupTrendForEnv(env), [env]);
  const lagTone = backupStats.avgLagMins > 5 ? 'warn' : 'neutral';

  const showToast = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 4000);
  };

  const handleConfirmRestore = (dbName) => {
    showToast(`Remediation workflow queued for ${dbName}`);
  };

  return (
    <div className="relative space-y-5 min-h-full">
      <div className="azure-commandbar flex items-end justify-between px-5 py-4">
        <div>
          <div
            className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-1"
            style={{ color: C.inkMute }}
          >
            Policy & Controls · Console
          </div>
          <h1 className="font-display text-2xl font-semibold" style={{ color: C.ink }}>
            Security policies & control enforcement · {env}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-[11px] font-mono-num" style={{ color: C.inkMute }}>
            <Shield size={14} style={{ color: C.accent }} />
            {backupStats.jobs.length} policy evaluations in view
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3">
          <Kpi label="Total controls" value={backupStats.totalJobs.toLocaleString()} icon={FileCheck} />
        </div>
        <div className="col-span-3">
          <Kpi
            label="Compliant (24h)"
            value={backupStats.success24h.toLocaleString()}
            tone="ok"
            delta={2.1}
            deltaLabel="%"
          />
        </div>
        <div className="col-span-3">
          <Kpi
            label="Non-compliant"
            value={backupStats.failed24h}
            tone="crit"
            icon={AlertTriangle}
            delta={8}
            deltaLabel=""
          />
        </div>
        <div className="col-span-3">
          <Kpi
            label="Avg policy drift"
            value={backupStats.avgLagMins}
            unit="d"
            tone={lagTone}
            icon={Clock}
            delta={-0.6}
            deltaLabel=" d"
          />
        </div>
      </div>

      <ComplianceGauges
        rtoPct={backupStats.rtoPct}
        rpoPct={backupStats.rpoPct}
        rtoTarget={RTO_TARGET_PCT}
        rpoTarget={RPO_TARGET_PCT}
        rtoTrend={backupStats.rtoTrend}
        rpoTrend={backupStats.rpoTrend}
      />

      <BackupJobsTable jobs={backupStats.jobs} onInitiateRestore={setRestoreJob} />

      <BackupTrendChart data={backupTrend} />

      {restoreJob && (
        <RestoreModal
          job={restoreJob}
          onClose={() => setRestoreJob(null)}
          onConfirm={handleConfirmRestore}
        />
      )}

      {toast && (
        <div
          className="absolute bottom-6 right-6 z-[60] px-4 py-3 text-sm font-medium text-white rounded-lg shadow-lg"
          style={{ background: C.sidebar }}
          role="status"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
