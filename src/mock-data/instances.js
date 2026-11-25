import { REGIONS, SECURITY_DOMAINS } from './helpers';
import { ALL_ENVS, envSalt } from './envScope';
import { formatStorageTb } from './storage';
import { assetName, ENV_SLUG } from './securityData';

export const INSTANCE_HOST_TYPES = ['VMs', 'Bare Metal', 'EOL Compliance'];

const seeded = (i, salt = 0) => {
  const x = Math.sin((i + 1) * 7123 + salt * 4099) * 10000;
  return x - Math.floor(x);
};

const ENV_SCALE = {
  [ALL_ENVS]: 1,
  Production: 0.76,
  Staging: 0.13,
  DR: 0.07,
  Development: 0.04,
};

function buildHostProfile(kind, env) {
  const scale = ENV_SCALE[env] ?? 1;
  const salt = envSalt(env, kind === 'vms' ? 91 : 92);
  const isVm = kind === 'vms';

  const hostCount = Math.round((isVm ? 842 : 318) * scale * (0.9 + seeded(0, salt) * 0.18));
  const dbCount = Math.round((isVm ? 1124 : 423) * scale * (0.92 + seeded(1, salt) * 0.14));
  const storageTb = Math.round((isVm ? 980 : 640) * scale * (0.94 + seeded(2, salt) * 0.1));
  const usedStorageTb = Math.round(storageTb * (0.66 + seeded(3, salt) * 0.14));
  const uniqueUsers = Math.round((isVm ? 2840 : 1240) * scale * (0.88 + seeded(4, salt) * 0.2));
  const activeSessions = Math.round((isVm ? 4200 : 1890) * scale * (0.85 + seeded(5, salt) * 0.22));
  const privilegedUsers = Math.round(uniqueUsers * (isVm ? 0.06 : 0.09));
  const serviceAccounts = Math.round(uniqueUsers * (isVm ? 0.18 : 0.14));

  const usersByRole = [
    { role: 'Standard user', count: Math.round(uniqueUsers * 0.48), pct: 48 },
    { role: 'Read-only analyst', count: Math.round(uniqueUsers * 0.22), pct: 22 },
    { role: 'SOC operator', count: Math.round(uniqueUsers * 0.1), pct: 10 },
    { role: 'Service account', count: serviceAccounts, pct: Math.round((serviceAccounts / uniqueUsers) * 100) },
    { role: 'Privileged admin', count: privilegedUsers, pct: Math.round((privilegedUsers / uniqueUsers) * 100) },
  ];

  const byRegion = REGIONS.map((region, i) => {
    const share = 0.1 + seeded(i + 10, salt) * 0.08;
    const hosts = Math.max(2, Math.round(hostCount * share));
    const storage = Math.round(usedStorageTb * share);
    const users = Math.round(uniqueUsers * share);
    return { region, hosts, storageTb: storage, users, databases: Math.round(dbCount * share) };
  });

  const envSlug = env === ALL_ENVS ? 'prod' : ENV_SLUG[env] || 'prod';
  const hosts = Array.from({ length: 8 }, (_, i) => {
    const used = Math.round(12 + seeded(i + 30, salt) * 80);
    const total = Math.round(used * (1.1 + seeded(i + 40, salt) * 0.15));
    const prefix = isVm ? 'sec-vm' : 'sec-bm';
    const domain = SECURITY_DOMAINS[i % SECURITY_DOMAINS.length];
    return {
      hostname: `${prefix}-${envSlug}-${REGIONS[i % REGIONS.length].toLowerCase().replace(/\s/g, '')}-${String(i + 1).padStart(2, '0')}`,
      region: REGIONS[i % REGIONS.length],
      dbType: domain,
      databases: Math.floor(seeded(i + 50, salt) * 18) + 2,
      storageUsedTb: used,
      storageTotalTb: total,
      users: Math.floor(seeded(i + 60, salt) * 120) + 8,
      activeSessions: Math.floor(seeded(i + 70, salt) * 180) + 12,
      cpuPct: Math.round(38 + seeded(i + 80, salt) * 42),
      memPct: Math.round(42 + seeded(i + 90, salt) * 38),
      edrStatus: seeded(i + 100, salt) > 0.88 ? 'at-risk' : 'protected',
      status: seeded(i + 101, salt) > 0.88 ? 'warning' : 'healthy',
    };
  }).sort((a, b) => b.storageUsedTb - a.storageUsedTb);

  const storageTrend7d = Array.from({ length: 7 }, (_, i) => ({
    day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
    used: Math.round(usedStorageTb * (0.94 + (i / 6) * 0.06) + (seeded(i + 110, salt) - 0.5) * 12),
    users: Math.round(uniqueUsers * (0.97 + (i / 6) * 0.03)),
  }));

  return {
    kind: isVm ? 'VMs' : 'Bare Metal',
    hostCount,
    dbCount,
    storageTb,
    usedStorageTb,
    availableStorageTb: storageTb - usedStorageTb,
    storageUtilPct: Math.round((usedStorageTb / storageTb) * 1000) / 10,
    uniqueUsers,
    activeSessions,
    privilegedUsers,
    serviceAccounts,
    avgCpuPct: Math.round((isVm ? 48 : 52) + seeded(6, salt) * 20),
    avgMemPct: Math.round((isVm ? 52 : 58) + seeded(7, salt) * 18),
    vcpuTotal: Math.round((isVm ? 6720 : 5088) * scale),
    ramTb: Math.round((isVm ? 84 : 128) * scale * 10) / 10,
    usersByRole,
    byRegion,
    hosts,
    storageTrend7d,
  };
}

export function getInstancesForEnv(env = ALL_ENVS) {
  const vms = buildHostProfile('vms', env);
  const bareMetal = buildHostProfile('bare', env);

  return {
    vms,
    bareMetal,
    combined: {
      hostCount: vms.hostCount + bareMetal.hostCount,
      dbCount: vms.dbCount + bareMetal.dbCount,
      usedStorageTb: vms.usedStorageTb + bareMetal.usedStorageTb,
      uniqueUsers: vms.uniqueUsers + bareMetal.uniqueUsers,
      activeSessions: vms.activeSessions + bareMetal.activeSessions,
    },
    comparison: [
      { name: 'VMs', hosts: vms.hostCount, storage: vms.usedStorageTb, users: vms.uniqueUsers, databases: vms.dbCount, sessions: vms.activeSessions },
      { name: 'Bare Metal', hosts: bareMetal.hostCount, storage: bareMetal.usedStorageTb, users: bareMetal.uniqueUsers, databases: bareMetal.dbCount, sessions: bareMetal.activeSessions },
    ],
    storageComparison: [
      { name: 'VMs', used: vms.usedStorageTb, available: vms.availableStorageTb },
      { name: 'Bare Metal', used: bareMetal.usedStorageTb, available: bareMetal.availableStorageTb },
    ],
    userComparison: [
      { name: 'VMs', users: vms.uniqueUsers, sessions: vms.activeSessions },
      { name: 'Bare Metal', users: bareMetal.uniqueUsers, sessions: bareMetal.activeSessions },
    ],
  };
}

export function getInstanceProfile(instances, hostType) {
  if (hostType === 'Bare Metal') return instances.bareMetal;
  if (hostType === 'EOL Compliance') return instances.vms;
  return instances.vms;
}

export { formatStorageTb };
