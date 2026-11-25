export const ARCHITECTURE_KPIS = {
  controlPlanes: 5,
  securityLayers: 6,
  integratedPlatforms: 19,
  responseChannels: 8,
};

export const ARCHITECTURE_FLOW = [
  {
    id: 'sources',
    title: 'Telemetry Sources',
    subtitle: 'Security signals',
    tone: 'info',
    items: [
      'Identity providers',
      'Endpoints & EDR',
      'Cloud platforms',
      'Applications & APIs',
    ],
  },
  {
    id: 'ingestion',
    title: 'Ingestion Layer',
    subtitle: 'Collection & normalization',
    tone: 'accent',
    items: [
      'Connector framework',
      'Event parsing',
      'Asset correlation',
      'Schema normalization',
    ],
  },
  {
    id: 'detection',
    title: 'Detection & Analytics',
    subtitle: 'SOC intelligence',
    tone: 'warn',
    items: [
      'Threat correlation',
      'Vulnerability scoring',
      'Behavior analytics',
      'Exposure graph',
    ],
  },
  {
    id: 'governance',
    title: 'Governance Engine',
    subtitle: 'Policy & compliance',
    tone: 'neutral',
    items: [
      'Control validation',
      'Evidence collection',
      'Risk registers',
      'Audit workflows',
    ],
  },
  {
    id: 'ai',
    title: 'AI Security Layer',
    subtitle: 'Model-aware protection',
    tone: 'p3',
    items: [
      'Prompt inspection',
      'Model drift alerts',
      'Guardrail policies',
      'AI risk scoring',
    ],
  },
  {
    id: 'response',
    title: 'Response Orchestration',
    subtitle: 'Human + automated action',
    tone: 'ok',
    items: [
      'SOAR playbooks',
      'ITSM escalation',
      'Ticket automation',
      'Executive reporting',
    ],
  },
];

export const ARCHITECTURE_LAYERS = [
  {
    name: 'Identity Security',
    purpose: 'Authentication, session trust, privileged access, MFA assurance.',
    systems: ['Entra ID', 'Okta', 'PAM', 'Conditional Access'],
    owner: 'IAM Team',
    coverage: '98%',
  },
  {
    name: 'Endpoint & Workload Protection',
    purpose: 'Agent health, malware prevention, device isolation, server posture.',
    systems: ['CrowdStrike', 'Tanium', 'Defender', 'VM telemetry'],
    owner: 'Endpoint Security',
    coverage: '96%',
  },
  {
    name: 'Cloud & Network Defense',
    purpose: 'Exposure management, east-west visibility, misconfiguration detection.',
    systems: ['Prisma', 'Wiz', 'CloudTrail', 'Firewall telemetry'],
    owner: 'Cloud Security',
    coverage: '94%',
  },
  {
    name: 'Data Governance',
    purpose: 'Classification, retention, DLP, sovereignty, evidence lifecycle.',
    systems: ['DLP engine', 'Classification service', 'Vault archives'],
    owner: 'Data Office',
    coverage: '92%',
  },
  {
    name: 'AI Security',
    purpose: 'Prompt defense, model integrity, RAG access control, output policies.',
    systems: ['Prompt gateway', 'Guardrail service', 'Model registry'],
    owner: 'AI Security',
    coverage: '89%',
  },
  {
    name: 'SOC Command',
    purpose: 'Unified analytics, investigations, response workflows, executive insight.',
    systems: ['Splunk', 'SOAR', 'ServiceNow', 'Case management'],
    owner: 'Security Operations',
    coverage: '24x7',
  },
];

export const ARCHITECTURE_DATA_PATHS = [
  {
    source: 'Identity providers',
    transport: 'Connector APIs -> event bus',
    policy: 'Session anomaly scoring + MFA policy checks',
    outcome: 'Identity risk cases routed to SOC',
  },
  {
    source: 'Cloud & CNAPP findings',
    transport: 'Normalized JSON -> exposure graph',
    policy: 'Public exposure + least-privilege controls',
    outcome: 'Misconfiguration remediation workflows',
  },
  {
    source: 'Endpoint telemetry',
    transport: 'EDR stream -> SIEM -> SOAR',
    policy: 'Malware / ransomware detection logic',
    outcome: 'Device isolation and analyst escalation',
  },
  {
    source: 'Sensitive data activity',
    transport: 'DLP alerts -> governance engine',
    policy: 'Classification, retention, sovereignty',
    outcome: 'Evidence capture + compliance actions',
  },
  {
    source: 'LLM interactions',
    transport: 'Prompt gateway -> AI policy service',
    policy: 'Prompt injection + output leakage controls',
    outcome: 'AI risk alerts and blocked responses',
  },
];

export const ARCHITECTURE_PRINCIPLES = [
  {
    title: 'Zero Trust Enforcement',
    detail: 'Every source is verified before data enters the analytics and orchestration planes.',
  },
  {
    title: 'Single Security Data Model',
    detail: 'Assets, findings, incidents, and policies use shared identifiers for consistent reporting.',
  },
  {
    title: 'AI-Aware Governance',
    detail: 'Model interactions are treated as first-class security events alongside cloud and endpoint telemetry.',
  },
  {
    title: 'Human-in-the-Loop Response',
    detail: 'SOAR handles low-risk actions automatically while material events escalate to analysts and leaders.',
  },
];
