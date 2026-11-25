import { REGIONS, SECURITY_DOMAINS, ENVS } from './helpers';
import {
  POLICY_CONTROL_TYPES,
  POLICY_STATUSES,
  assetName,
  ENV_SLUG,
} from './securityData';

export { POLICY_CONTROL_TYPES, POLICY_STATUSES };

const seeded = (i, salt = 0) => {
  const x = Math.sin((i + 1) * 9301 + salt * 49297) * 10000;
  return x - Math.floor(x);
};

const pickSeeded = (arr, i, salt = 0) => arr[Math.floor(seeded(i, salt) * arr.length)];

const POLICY_FRAMEWORKS = ['CIS', 'NIST CSF', 'ISO 27001', 'SOC 2', 'PCI-DSS', 'Zero Trust'];

function formatEvaluatedAt(i) {
  const hoursAgo = Math.floor(seeded(i, 3) * 22) + 1;
  const d = new Date();
  d.setHours(d.getHours() - hoursAgo, Math.floor(seeded(i, 4) * 59), 0, 0);
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

function formatLastAudit(i) {
  if (seeded(i, 5) < 0.12) return 'Overdue';
  const daysAgo = Math.floor(seeded(i, 6) * 90) + 1;
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function generatePolicyJobs(count = 40) {
  return Array.from({ length: count }, (_, i) => {
    const domain = pickSeeded(SECURITY_DOMAINS, i, 1);
    const env = pickSeeded(ENVS, i, 2);
    const envSlug = ENV_SLUG[env] || 'prod';
    const statusRoll = seeded(i, 7);
    const status =
      statusRoll < 0.68
        ? 'COMPLIANT'
        : statusRoll < 0.82
          ? 'NON_COMPLIANT'
          : statusRoll < 0.92
            ? 'IN_PROGRESS'
            : 'EXPIRED';

    const slaMet = seeded(i, 8) > 0.08;
    const evidenceMet = seeded(i, 9) > 0.12;

    return {
      id: `pol-${String(i + 1).padStart(4, '0')}`,
      db_name: assetName(domain, envSlug, Math.floor(seeded(i, 10) * 89) + 1),
      policy_name: `${pickSeeded(POLICY_FRAMEWORKS, i, 11)} · ${pickSeeded(['MFA enforcement', 'Encryption at rest', 'Least privilege', 'Log retention', 'Patch SLA', 'DLP scope'], i, 12)}`,
      region: pickSeeded(REGIONS, i, 13),
      db_type: domain,
      env,
      backup_type: pickSeeded(POLICY_CONTROL_TYPES, i, 14),
      status,
      started_at: formatEvaluatedAt(i),
      duration_mins: status === 'IN_PROGRESS' ? null : +(seeded(i, 13) * 45 + 2).toFixed(1),
      size_gb: null,
      coverage_pct: status === 'EXPIRED' ? null : +(78 + seeded(i, 14) * 22).toFixed(1),
      lag_mins: status === 'EXPIRED' ? +(seeded(i, 15) * 45 + 8).toFixed(1) : +(seeded(i, 15) * 5).toFixed(1),
      last_restore_test: formatLastAudit(i),
      rto_met: slaMet,
      rpo_met: evidenceMet,
    };
  });
}

function generateTrend(days = 30) {
  const base = new Date();
  base.setDate(base.getDate() - (days - 1));
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const failed = Math.floor(seeded(i, 20) * 18) + 4;
    const success = Math.floor(seeded(i, 21) * 80) + 420;
    return {
      date: d.toISOString().slice(5, 10),
      success,
      failed,
    };
  });
}

export const BACKUP_JOBS = generatePolicyJobs(40);
export const BACKUP_TREND = generateTrend(30);

export const TOTAL_JOBS = 1548;
export const SUCCESS_24H = 1489;
export const FAILED_24H = 59;
export const AVG_LAG_MINS = 2.1;
export const RTO_PCT = 96.2;
export const RPO_PCT = 93.8;

export const RTO_TARGET_PCT = 95;
export const RPO_TARGET_PCT = 95;
export const RTO_TREND = 1.4;
export const RPO_TREND = -0.6;
