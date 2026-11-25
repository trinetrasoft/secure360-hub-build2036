/** EOL risk classification and visual tokens. */

export const RISK_LEVELS = ['Critical', 'High', 'Medium', 'Low'];

export const COMPLIANCE_STATUSES = ['Compliant', 'Non-Compliant', 'Exempted', 'Unknown'];

export function daysUntil(dateStr) {
  const target = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

export function classifyRisk(daysRemaining) {
  if (daysRemaining < 0 || daysRemaining <= 30) return 'Critical';
  if (daysRemaining <= 90) return 'High';
  if (daysRemaining <= 180) return 'Medium';
  return 'Low';
}

export function riskTone(risk) {
  switch (risk) {
    case 'Critical':
      return 'crit';
    case 'High':
      return 'warn';
    case 'Medium':
      return 'neutral';
    default:
      return 'ok';
  }
}

export function riskColor(risk, theme = 'light') {
  const map = theme === 'dark'
    ? { Critical: '#f87171', High: '#fb923c', Medium: '#facc15', Low: '#4ade80', Compliant: '#4ade80' }
    : { Critical: '#dc2626', High: '#ea580c', Medium: '#ca8a04', Low: '#059669', Compliant: '#059669' };
  return map[risk] || map.Low;
}

export function complianceTone(status) {
  switch (status) {
    case 'Compliant':
      return 'ok';
    case 'Non-Compliant':
      return 'crit';
    case 'Exempted':
      return 'info';
    default:
      return 'neutral';
  }
}

export function deriveInstanceRisk(instance) {
  const dbDays = daysUntil(instance.databaseEolDate);
  const osDays = daysUntil(instance.osEolDate);
  const nearest = Math.min(dbDays, osDays);
  return {
    daysRemaining: nearest,
    riskRating: classifyRisk(nearest),
    dbDaysRemaining: dbDays,
    osDaysRemaining: osDays,
  };
}
