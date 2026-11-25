/**
 * Per-connector connection form fields shown when user clicks Connect on catalog cards.
 */

const COMMON_ENV = {
  key: 'environment',
  label: 'Target environment',
  type: 'select',
  required: true,
  options: ['Production', 'Staging', 'DR', 'Development', 'All Environments'],
  defaultValue: 'Production',
};

/** @type {Record<string, { hint?: string, fields: object[] }>} */
const BY_ID = {
  azure: {
    hint: 'Register an Azure AD app with Monitoring Reader on the subscription scope.',
    fields: [
      COMMON_ENV,
      { key: 'tenantId', label: 'Directory (tenant) ID', type: 'text', required: true, placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
      { key: 'subscriptionId', label: 'Subscription ID', type: 'text', required: true, placeholder: 'Azure subscription GUID' },
      { key: 'clientId', label: 'Application (client) ID', type: 'text', required: true },
      { key: 'clientSecret', label: 'Client secret', type: 'password', required: true },
      { key: 'workspaceId', label: 'Log Analytics workspace ID', type: 'text', required: false, placeholder: 'Optional — for metric/log ingest' },
    ],
  },
  gcp: {
    hint: 'Use a service account with roles/monitoring.viewer and logging.viewer.',
    fields: [
      COMMON_ENV,
      { key: 'projectId', label: 'GCP project ID', type: 'text', required: true, placeholder: 'my-prod-project' },
      { key: 'serviceAccountJson', label: 'Service account JSON key', type: 'textarea', required: true, placeholder: 'Paste JSON key contents' },
      { key: 'metricsScope', label: 'Metrics scope', type: 'select', required: true, options: ['Project', 'Workspace'], defaultValue: 'Project' },
    ],
  },
  dd: {
    hint: 'Create a Datadog API key and Application key with read scopes for metrics and events.',
    fields: [
      COMMON_ENV,
      { key: 'site', label: 'Datadog site', type: 'select', required: true, options: ['datadoghq.com', 'datadoghq.eu', 'us3.datadoghq.com', 'us5.datadoghq.com'], defaultValue: 'datadoghq.com' },
      { key: 'apiKey', label: 'API key', type: 'password', required: true },
      { key: 'appKey', label: 'Application key', type: 'password', required: true },
      { key: 'hostFilter', label: 'Host filter tag', type: 'text', required: false, placeholder: 'env:production,service:database' },
    ],
  },
  dyna: {
    hint: 'Generate an API token with DataExport and entities.read permissions.',
    fields: [
      COMMON_ENV,
      { key: 'environmentUrl', label: 'Environment URL', type: 'text', required: true, placeholder: 'https://abc123.live.dynatrace.com' },
      { key: 'apiToken', label: 'API token', type: 'password', required: true },
      { key: 'entitySelector', label: 'Entity selector', type: 'text', required: false, placeholder: 'type(SERVICE),tag(db_tier)' },
    ],
  },
  appd: {
    hint: 'Use a Controller admin API client from your AppDynamics SaaS or on-prem controller.',
    fields: [
      COMMON_ENV,
      { key: 'controllerUrl', label: 'Controller URL', type: 'text', required: true, placeholder: 'https://yourtenant.saas.appdynamics.com' },
      { key: 'accountName', label: 'Account name', type: 'text', required: true },
      { key: 'clientId', label: 'OAuth client ID', type: 'text', required: true },
      { key: 'clientSecret', label: 'OAuth client secret', type: 'password', required: true },
    ],
  },
  'asset-connector': {
    hint: 'Ingest security assets from CMDB or asset inventory. Use read-only API credentials where possible.',
    fields: [
      COMMON_ENV,
      {
        key: 'dbEngine',
        label: 'Asset domain',
        type: 'select',
        required: true,
        options: [
          'Cloud',
          'Identity',
          'Endpoint',
          'Network',
          'Application',
          'Data',
          'AI Systems',
          'Other',
        ],
        defaultValue: 'Cloud',
      },
      { key: 'connectionName', label: 'Connection name', type: 'text', required: true, placeholder: 'e.g. prod-cloud-assets' },
      { key: 'host', label: 'API endpoint / host', type: 'text', required: true, placeholder: 'api.security.corp.local' },
      { key: 'port', label: 'Port', type: 'text', required: false, placeholder: '443', defaultValue: '443' },
      {
        key: 'database',
        label: 'Scope / collection',
        type: 'text',
        required: true,
        placeholder: 'Asset collection or API scope identifier',
      },
      { key: 'username', label: 'Username', type: 'text', required: true, placeholder: 'Read-only DB user recommended' },
      { key: 'password', label: 'Password', type: 'password', required: true },
      {
        key: 'sslMode',
        label: 'SSL / TLS mode',
        type: 'select',
        required: true,
        options: ['disable', 'prefer', 'require', 'verify-ca', 'verify-full'],
        defaultValue: 'require',
      },
      { key: 'schema', label: 'Schema (optional)', type: 'text', required: false, placeholder: 'APP_SCHEMA' },
      {
        key: 'jdbcOptions',
        label: 'Extra connection options',
        type: 'textarea',
        required: false,
        placeholder: 'connectTimeout=30&socketTimeout=60 or driver-specific params',
      },
    ],
  },
  elastic: {
    hint: 'Elastic Cloud API key or cluster URL with API key for SIEM detection data.',
    fields: [
      COMMON_ENV,
      { key: 'clusterUrl', label: 'Elasticsearch / Kibana URL', type: 'text', required: true, placeholder: 'https://my-deployment.es.io:9243' },
      { key: 'apiKey', label: 'API key', type: 'password', required: true },
      { key: 'spaceId', label: 'Kibana space ID', type: 'text', required: false, placeholder: 'default' },
      { key: 'indexPattern', label: 'Index pattern', type: 'text', required: false, placeholder: 'logs-db-*' },
    ],
  },
  crowd: {
    hint: 'Falcon API client with read access to Hosts and Detects scopes.',
    fields: [
      COMMON_ENV,
      { key: 'baseUrl', label: 'API base URL', type: 'select', required: true, options: ['https://api.crowdstrike.com', 'https://api.eu-1.crowdstrike.com', 'https://api.us-2.crowdstrike.com'], defaultValue: 'https://api.crowdstrike.com' },
      { key: 'clientId', label: 'Client ID', type: 'text', required: true },
      { key: 'clientSecret', label: 'Client secret', type: 'password', required: true },
      { key: 'cid', label: 'Customer ID (CID)', type: 'text', required: true },
    ],
  },
  prisma: {
    hint: 'Prisma Cloud access key with read-only role for cloud and asset inventory.',
    fields: [
      COMMON_ENV,
      { key: 'consoleUrl', label: 'Console URL', type: 'text', required: true, placeholder: 'https://app.prismacloud.io' },
      { key: 'accessKeyId', label: 'Access key ID', type: 'text', required: true },
      { key: 'secretKey', label: 'Secret key', type: 'password', required: true },
      { key: 'accountGroup', label: 'Account group', type: 'text', required: false },
    ],
  },
  wiz: {
    hint: 'Wiz service account with graph.read and issue.read permissions.',
    fields: [
      COMMON_ENV,
      { key: 'authUrl', label: 'Auth URL', type: 'text', required: true, placeholder: 'https://auth.app.wiz.io/oauth/token' },
      { key: 'clientId', label: 'Client ID', type: 'text', required: true },
      { key: 'clientSecret', label: 'Client secret', type: 'password', required: true },
      { key: 'projectId', label: 'Project / tenant ID', type: 'text', required: true },
    ],
  },
  tenable: {
    hint: 'Tenable.io API keys from Settings → My Account → API Keys.',
    fields: [
      COMMON_ENV,
      { key: 'accessKey', label: 'Access key', type: 'text', required: true },
      { key: 'secretKey', label: 'Secret key', type: 'password', required: true },
      { key: 'exportUuid', label: 'Asset export UUID', type: 'text', required: false },
    ],
  },
  qualys: {
    hint: 'Qualys platform URL and API user with VM and asset inventory read access.',
    fields: [
      COMMON_ENV,
      { key: 'platformUrl', label: 'Platform URL', type: 'select', required: true, options: ['https://qualysapi.qg2.apps.qualys.com', 'https://qualysapi.qualys.eu', 'https://qualysapi.qg3.apps.qualys.com'], defaultValue: 'https://qualysapi.qg2.apps.qualys.com' },
      { key: 'username', label: 'API username', type: 'text', required: true },
      { key: 'password', label: 'API password', type: 'password', required: true },
    ],
  },
  tanium: {
    hint: 'Tanium Server API token with read permissions on computer groups.',
    fields: [
      COMMON_ENV,
      { key: 'serverUrl', label: 'Server URL', type: 'text', required: true, placeholder: 'https://tanium.company.com' },
      { key: 'apiToken', label: 'API token', type: 'password', required: true },
      { key: 'computerGroup', label: 'Computer group name', type: 'text', required: false, placeholder: 'Database servers' },
    ],
  },
  'snow-cmdb': {
    hint: 'ServiceNow instance with CMDB read role and integration user.',
    fields: [
      COMMON_ENV,
      { key: 'instanceUrl', label: 'Instance URL', type: 'text', required: true, placeholder: 'https://company.service-now.com' },
      { key: 'username', label: 'Integration user', type: 'text', required: true },
      { key: 'password', label: 'Password', type: 'password', required: true },
      { key: 'tableScope', label: 'CMDB tables', type: 'text', required: false, placeholder: 'cmdb_ci_database,cmdb_ci_server' },
    ],
  },
  'aws-config': {
    hint: 'IAM role or access keys with AWS Config and resource read permissions.',
    fields: [
      COMMON_ENV,
      { key: 'authMethod', label: 'Authentication', type: 'select', required: true, options: ['IAM role (assume role)', 'Access keys'], defaultValue: 'IAM role (assume role)' },
      { key: 'roleArn', label: 'Role ARN', type: 'text', required: true, placeholder: 'arn:aws:iam::123456789012:role/ConfigReader' },
      { key: 'externalId', label: 'External ID', type: 'text', required: true },
      { key: 'regions', label: 'Regions', type: 'text', required: true, placeholder: 'us-east-1,us-west-2,eu-west-2' },
      { key: 'accessKeyId', label: 'Access key ID', type: 'text', required: false },
      { key: 'secretAccessKey', label: 'Secret access key', type: 'password', required: false },
    ],
  },
  'azure-arc': {
    hint: 'Azure Arc enabled servers — use same service principal as Azure Monitor with Arc Reader.',
    fields: [
      COMMON_ENV,
      { key: 'tenantId', label: 'Tenant ID', type: 'text', required: true },
      { key: 'subscriptionId', label: 'Subscription ID', type: 'text', required: true },
      { key: 'resourceGroup', label: 'Resource group', type: 'text', required: true, placeholder: 'rg-database-arc' },
      { key: 'clientSecret', label: 'Client secret', type: 'password', required: true },
    ],
  },
  'gcp-asset': {
    hint: 'GCP Asset Inventory API — service account with cloudasset.viewer.',
    fields: [
      COMMON_ENV,
      { key: 'projectId', label: 'Project ID', type: 'text', required: true },
      { key: 'serviceAccountJson', label: 'Service account JSON', type: 'textarea', required: true },
      { key: 'orgId', label: 'Organization ID', type: 'text', required: false },
    ],
  },
  sccm: {
    hint: 'SCCM / MECM site server WMI or CMG API credentials.',
    fields: [
      COMMON_ENV,
      { key: 'siteServer', label: 'Site server FQDN', type: 'text', required: true, placeholder: 'sccm01.corp.local' },
      { key: 'siteCode', label: 'Site code', type: 'text', required: true, placeholder: 'PS1' },
      { key: 'domainUser', label: 'Domain user', type: 'text', required: true },
      { key: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  ansible: {
    hint: 'Ansible Automation Platform / Tower token with read on inventories and job templates.',
    fields: [
      COMMON_ENV,
      { key: 'towerUrl', label: 'Tower / AAP URL', type: 'text', required: true, placeholder: 'https://tower.company.com' },
      { key: 'token', label: 'OAuth / personal access token', type: 'password', required: true },
      { key: 'organization', label: 'Organization', type: 'text', required: false, placeholder: 'Database Ops' },
    ],
  },
};

/** Category fallback when connector id has no specific schema. */
const BY_CATEGORY = {
  Cloud: {
    hint: 'Provide cloud API credentials for metric and inventory ingest.',
    fields: [
      COMMON_ENV,
      { key: 'endpoint', label: 'API endpoint', type: 'text', required: true },
      { key: 'apiKey', label: 'API key / token', type: 'password', required: true },
      { key: 'accountId', label: 'Account / subscription ID', type: 'text', required: false },
    ],
  },
  SIEM: {
    hint: 'SIEM platform API credentials for security event correlation.',
    fields: [
      COMMON_ENV,
      { key: 'endpoint', label: 'Platform URL', type: 'text', required: true },
      { key: 'apiKey', label: 'API key', type: 'password', required: true },
      { key: 'index', label: 'Index / data source', type: 'text', required: false },
    ],
  },
  Database: {
    hint: 'Direct database connection — use the DB Connector catalog entry for full engine support.',
    fields: [
      COMMON_ENV,
      { key: 'dbEngine', label: 'Database engine', type: 'select', required: true, options: ['PostgreSQL', 'Oracle', 'MySQL', 'SQL Server', 'Other'], defaultValue: 'PostgreSQL' },
      { key: 'host', label: 'Host', type: 'text', required: true },
      { key: 'port', label: 'Port', type: 'text', required: true, defaultValue: '5432' },
      { key: 'database', label: 'Database name', type: 'text', required: true },
      { key: 'username', label: 'Username', type: 'text', required: true },
      { key: 'password', label: 'Password', type: 'password', required: true },
    ],
  },
  default: {
    hint: 'Enter connection credentials for this integration.',
    fields: [
      COMMON_ENV,
      { key: 'endpoint', label: 'Endpoint URL', type: 'text', required: true, placeholder: 'https://api.example.com' },
      { key: 'apiKey', label: 'API key or token', type: 'password', required: true },
      { key: 'username', label: 'Username (optional)', type: 'text', required: false },
    ],
  },
};

/** Default TCP ports when user picks an engine (Connect modal may auto-fill). */
export const DB_ENGINE_DEFAULT_PORTS = {
  Oracle: '1521',
  PostgreSQL: '5432',
  MySQL: '3306',
  MariaDB: '3306',
  'SQL Server': '1433',
  MongoDB: '27017',
  'IBM DB2': '50000',
  'SAP HANA': '39015',
  Cassandra: '9042',
  Redis: '6379',
  'Sybase ASE': '5000',
  Other: '5432',
};

export function getConnectSchema(connector) {
  if (!connector) return BY_CATEGORY.default;
  return BY_ID[connector.id] || BY_CATEGORY[connector.cat] || BY_CATEGORY.default;
}

export function emptyFormForSchema(schema) {
  const values = {};
  schema.fields.forEach((f) => {
    values[f.key] = f.defaultValue ?? '';
  });
  return values;
}

export function validateConnectForm(schema, values) {
  const missing = schema.fields
    .filter((f) => f.required && !String(values[f.key] ?? '').trim())
    .map((f) => f.label);
  if (missing.length) return `Required: ${missing.join(', ')}`;

  if (schema.fields.some((f) => f.key === 'roleArn') && values.authMethod === 'Access keys') {
    if (!values.accessKeyId?.trim() || !values.secretAccessKey?.trim()) {
      return 'Access key ID and secret are required when using access keys.';
    }
  }
  if (schema.fields.some((f) => f.key === 'roleArn') && values.authMethod !== 'Access keys') {
    if (!values.roleArn?.trim() || !values.externalId?.trim()) {
      return 'Role ARN and external ID are required for IAM role authentication.';
    }
  }

  if (schema.fields.some((f) => f.key === 'dbEngine')) {
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return 'Port must be a number between 1 and 65535.';
    }
    const host = String(values.host ?? '').trim();
    if (!host) return 'Host / endpoint is required.';
  }

  return null;
}

function buildDbEndpoint(values) {
  const engine = values.dbEngine || 'Database';
  const host = String(values.host ?? '').trim();
  const port = String(values.port ?? '').trim();
  const database = String(values.database ?? '').trim();
  const name = String(values.connectionName ?? '').trim();
  if (!host) return null;
  const target = port ? `${host}:${port}` : host;
  const dbPart = database ? `/${database}` : '';
  return name ? `${engine} · ${name} · ${target}${dbPart}` : `${engine}://${target}${dbPart}`;
}

/** Build connected fleet entry from catalog item + submitted credentials. */
export function buildConnectedConnector(catalogItem, values) {
  const endpoint =
    buildDbEndpoint(values) ||
    values.instanceUrl ||
    values.environmentUrl ||
    values.controllerUrl ||
    values.clusterUrl ||
    values.serverUrl ||
    values.towerUrl ||
    values.consoleUrl ||
    values.platformUrl ||
    values.baseUrl ||
    values.endpoint ||
    `${catalogItem.name} API`;

  const envLabel = values.environment ? ` · ${values.environment}` : '';

  return {
    ...catalogItem,
    status: 'connected',
    lastSync: 'Just now',
    records: Math.floor(Math.random() * 8000) + 200,
    lag: Math.floor(Math.random() * 12) + 2,
    endpoint: String(endpoint).trim(),
    description: `Connected${envLabel} · credentials verified`,
    connectionMeta: {
      environment: values.environment,
      connectedAt: new Date().toISOString(),
      ...(values.dbEngine
        ? {
            dbEngine: values.dbEngine,
            host: values.host,
            port: values.port,
            database: values.database,
            connectionName: values.connectionName,
            sslMode: values.sslMode,
            schema: values.schema || undefined,
          }
        : {}),
    },
  };
}
