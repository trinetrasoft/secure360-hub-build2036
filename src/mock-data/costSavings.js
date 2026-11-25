import { C } from '../theme/colors';
import { getCspOptimizationSummary } from './costOptimization';

const seeded = (i, salt = 0) => {
  const x = Math.sin((i + 1) * 3911 + salt * 2203) * 10000;
  return x - Math.floor(x);
};

export function buildCostSavingsDashboard(metrics, cspOptimizations, fleetFrac = 1) {
  const f = Math.max(0.05, fleetFrac);
  const { monthlySavings: cspPotential } = getCspOptimizationSummary(cspOptimizations);

  const aiRemediation = Math.round(metrics.costAvoided * f);
  const licenseOpt = Math.round(metrics.monthlySpend * 0.028 * f);
  const siemTuning = Math.round(metrics.monthlySpend * 0.016 * f);
  const toolConsolidation = Math.round(metrics.monthlySpend * 0.011 * f);
  const trainingAutomation = Math.round(metrics.monthlySpend * 0.005 * f);

  const mtdRealized = aiRemediation + licenseOpt + siemTuning + toolConsolidation + trainingAutomation;
  const ytdRealized = Math.round(mtdRealized * 4.35);
  const mtdPotential = Math.round(cspPotential * f);
  const totalOpportunity = mtdRealized + mtdPotential;
  const savingsRate = metrics.monthlySpend > 0 ? (mtdRealized / metrics.monthlySpend) * 100 : 0;
  const captureRate = totalOpportunity > 0 ? (mtdRealized / totalOpportunity) * 100 : 0;

  const breakdown = [
    { name: 'AI auto-remediation', amount: aiRemediation, color: '#7c3aed' },
    { name: 'License optimization', amount: licenseOpt, color: C.accent },
    { name: 'SIEM ingest tuning', amount: siemTuning, color: C.info },
    { name: 'Tool consolidation', amount: toolConsolidation, color: '#0d9488' },
    { name: 'GRC automation', amount: trainingAutomation, color: C.warn },
  ].filter((b) => b.amount > 0);

  const trend = Array.from({ length: 30 }, (_, i) => {
    const wave = 0.85 + seeded(i, 42) * 0.3;
    const realized = Math.round((mtdRealized / 30) * wave * (0.9 + i / 80));
    const potential = Math.round((mtdPotential / 30) * (0.7 + seeded(i, 9) * 0.5));
    return { day: `D-${30 - i}`, realized, potential, cumulative: 0 };
  });
  let cum = 0;
  trend.forEach((row) => {
    cum += row.realized;
    row.cumulative = cum;
  });

  const highlights = [
    { id: 'csp', source: 'Security tool optimization', title: `${cspOptimizations.length} open recommendations`, amount: mtdPotential, tone: 'potential' },
    { id: 'ai', source: 'AI security', title: `${metrics.aiAutoHealed} threats auto-contained`, amount: aiRemediation, tone: 'realized' },
    { id: 'lic', source: 'License optimization', title: 'EDR & CSPM seat reclamation', amount: licenseOpt, tone: 'realized' },
    { id: 'siem', source: 'SIEM tuning', title: 'Ingest filtering without detection loss', amount: siemTuning, tone: 'realized' },
  ];

  return {
    mtdRealized,
    ytdRealized,
    mtdPotential,
    totalOpportunity,
    savingsRate: Math.round(savingsRate * 10) / 10,
    captureRate: Math.round(captureRate * 10) / 10,
    breakdown,
    trend,
    highlights,
    programSpend: metrics.monthlySpend,
  };
}
