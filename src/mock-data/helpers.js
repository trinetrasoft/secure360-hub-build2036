// Random helpers used across mock-data generators.
export const rand = (min, max) => Math.random() * (max - min) + min;
export const randInt = (min, max) => Math.floor(rand(min, max + 1));
export const pick = (arr) => arr[randInt(0, arr.length - 1)];

export const REGIONS = ['US-East', 'US-West', 'UK', 'India', 'Singapore', 'Hong Kong', 'Australia'];
/** Security asset domains across the enterprise estate */
export const SECURITY_DOMAINS = ['Cloud', 'Identity', 'Endpoint', 'Network', 'Application', 'Data', 'AI Systems'];
/** @deprecated use SECURITY_DOMAINS */
export const DB_TYPES = SECURITY_DOMAINS;
export const ENVS = ['Production', 'Staging', 'DR', 'Development'];
