import { SECURITY_DOMAINS, REGIONS } from './helpers';
import { ALL_ENVS, envSalt } from './envScope';
import { C } from '../theme/colors';
import { DATA_CLASSIFICATIONS, DATA_STORE_TYPES, assetName, ENV_SLUG } from './securityData';

const seeded = (i, salt = 0) => {
  const x = Math.sin((i + 1) * 5821 + salt * 3181) * 10000;
  return x - Math.floor(x);
};

const ENV_STORAGE_SCALE = {
  [ALL_ENVS]: 1,
  Production: 0.78,
  Staging: 0.12,
  DR: 0.06,
  Development: 0.04,
};

export const STORAGE_PLATFORM_TYPES = ['Object Store', 'File Gateway', 'SaaS Vault'];

const PLATFORM_META = {
  'Object Store': {
    label: 'Object Store',
    subtitle: 'S3 · Blob · GCS classified buckets',
    color: '#2563eb',
    share: 0.44,
  },
  'File Gateway': {
    label: 'File Gateway',
    subtitle: 'NFS · SMB governed shares',
    color: C.accent,
    share: 0.32,
  },
  'SaaS Vault': {
    label: 'SaaS Vault',
    subtitle: 'M365 · Salesforce · sanctioned SaaS',
    color: '#7c3aed',
    share: 0.24,
  },
};

function buildPlatformVolumes(type, platformTotal, salt) {
  const prefixes = { 'Object Store': 'obj-bkt', 'File Gateway': 'file-gw', 'SaaS Vault': 'saas-vault' };
  const count = type === 'Object Store' ? 6 : type === 'File Gateway' ? 5 : 4;
  return Array.from({ length: count }, (_, i) => {
    const share = 0.12 + seeded(i + 100, salt) * 0.15;
    const total = Math.max(20, Math.round(platformTotal * share));
    const used = Math.round(total * (0.62 + seeded(i + 110, salt) * 0.32));
    return {
      id: `${prefixes[type]}-${String(i + 1).padStart(2, '0')}`,
      name: `${prefixes[type]}-${REGIONS[i % REGIONS.length].toLowerCase().replace(/\s/g, '-')}-${i + 1}`,
      region: REGIONS[i % REGIONS.length],
      totalTb: total,
      usedTb: used,
      freeTb: total - used,
      utilization: Math.round((used / total) * 100),
      protocol: type === 'Object Store' ? 'SSE-KMS' : type === 'File Gateway' ? 'SMB 3.1.1' : 'OAuth API',
      classification: DATA_CLASSIFICATIONS[i % DATA_CLASSIFICATIONS.length].name.split(' ')[0],
    };
  });
}

function buildPlatforms(totalTb, salt) {
  return STORAGE_PLATFORM_TYPES.map((type, idx) => {
    const meta = PLATFORM_META[type];
    const platformTotal = Math.round(totalTb * meta.share * (0.92 + seeded(idx + 130, salt) * 0.14));
    const platformUsed = Math.round(platformTotal * (0.68 + seeded(idx + 140, salt) * 0.26));
    const freeTb = platformTotal - platformUsed;
    return {
      type,
      ...meta,
      totalTb: platformTotal,
      usedTb: platformUsed,
      freeTb,
      availableTb: freeTb,
      utilizationPct: Math.round((platformUsed / platformTotal) * 1000) / 10,
      arrays: type === 'Object Store' ? Math.floor(seeded(idx + 150, salt) * 8) + 4 : Math.floor(seeded(idx + 151, salt) * 12) + 3,
      volumes: buildPlatformVolumes(type, platformTotal, salt + idx),
    };
  });
}

export function getPlatformStorage(storage, platformType) {
  return storage.byPlatform.find((p) => p.type === platformType) ?? storage.byPlatform[0];
}

export function formatStorageTb(tb) {
  if (tb >= 1000) return `${(tb / 1000).toFixed(2)} PB`;
  if (tb >= 100) return `${Math.round(tb)} TB`;
  return `${tb.toFixed(1)} TB`;
}

function buildStorageData(env) {
  const scale = ENV_STORAGE_SCALE[env] ?? 1;
  const salt = envSalt(env, 42);

  const totalTb = Math.round(1840 * scale * (0.94 + seeded(0, salt) * 0.12));
  const usedTb = Math.round(totalTb * (0.68 + seeded(1, salt) * 0.12));
  const availableTb = Math.max(0, totalTb - usedTb);
  const utilizationPct = Math.round((usedTb / totalTb) * 1000) / 10;
  const growthPct30d = Math.round((3.1 + seeded(2, salt) * 2.8) * 10) / 10;

  const byCategory = DATA_CLASSIFICATIONS.map((cat, i) => {
    const share = 0.12 + seeded(i + 3, salt) * 0.14;
    const catTotal = Math.round(totalTb * share);
    const catUsed = Math.round(catTotal * (0.65 + seeded(i + 10, salt) * 0.28));
    return {
      ...cat,
      total: catTotal,
      used: catUsed,
      available: catTotal - catUsed,
      utilization: Math.round((catUsed / catTotal) * 100),
    };
  });

  const byDbType = SECURITY_DOMAINS.map((type, i) => {
    const share = 0.08 + seeded(i + 20, salt) * 0.1;
    const typeTotal = Math.round(totalTb * share);
    const typeUsed = Math.round(typeTotal * (0.62 + seeded(i + 30, salt) * 0.3));
    return {
      type,
      total: typeTotal,
      used: typeUsed,
      available: typeTotal - typeUsed,
      utilization: Math.round((typeUsed / typeTotal) * 100),
    };
  });

  const byRegion = REGIONS.map((region, i) => {
    const share = 0.1 + seeded(i + 40, salt) * 0.08;
    const regTotal = Math.round(totalTb * share);
    const regUsed = Math.round(regTotal * (0.68 + seeded(i + 50, salt) * 0.25));
    return {
      region,
      total: regTotal,
      used: regUsed,
      available: regTotal - regUsed,
      utilization: Math.round((regUsed / regTotal) * 100),
    };
  });

  const trend30d = Array.from({ length: 30 }, (_, i) => {
    const prog = i / 29;
    const baseUsed = usedTb * (0.88 + prog * 0.12);
    const jitter = (seeded(i + 60, salt) - 0.5) * usedTb * 0.02;
    return {
      day: `D${i + 1}`,
      used: Math.round(baseUsed + jitter),
      provisioned: Math.round(totalTb * (0.98 + prog * 0.02)),
    };
  });

  const envSlug = env === ALL_ENVS ? 'prod' : ENV_SLUG[env] || 'prod';
  const topConsumers = Array.from({ length: 8 }, (_, i) => {
    const total = Math.round(28 + seeded(i + 70, salt) * 120);
    const used = Math.round(total * (0.72 + seeded(i + 80, salt) * 0.22));
    const domain = SECURITY_DOMAINS[i % SECURITY_DOMAINS.length];
    return {
      db: assetName(domain, envSlug, i + 1),
      dbType: domain,
      storeType: DATA_STORE_TYPES[i % DATA_STORE_TYPES.length],
      region: REGIONS[i % REGIONS.length],
      totalTb: total,
      usedTb: used,
      utilization: Math.round((used / total) * 100),
      growth7d: Math.round((seeded(i + 90, salt) * 6 - 1) * 10) / 10,
      records: Math.floor(seeded(i + 95, salt) * 4_000_000) + 120_000,
    };
  }).sort((a, b) => b.usedTb - a.usedTb);

  const byPlatform = buildPlatforms(totalTb, salt);
  const platformTotals = byPlatform.reduce(
    (acc, p) => ({
      totalTb: acc.totalTb + p.totalTb,
      usedTb: acc.usedTb + p.usedTb,
      freeTb: acc.freeTb + p.freeTb,
    }),
    { totalTb: 0, usedTb: 0, freeTb: 0 }
  );

  return {
    totalTb,
    usedTb,
    availableTb,
    utilizationPct,
    growthPct30d,
    byCategory,
    byDbType,
    byRegion,
    byPlatform,
    platformTotals,
    trend30d,
    topConsumers,
    classifiedRecords: Math.round(usedTb * 1_200_000),
    dlpIncidents30d: Math.floor(12 + seeded(5, salt) * 18),
  };
}

export function getStorageForEnv(env = ALL_ENVS) {
  return buildStorageData(env);
}
