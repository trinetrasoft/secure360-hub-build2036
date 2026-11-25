import React, { useMemo } from 'react';
import { Sparkles, Brain, Zap, Gauge, ShieldCheck, PlayCircle } from 'lucide-react';
import Panel from '../components/ui/Panel';
import Pill from '../components/ui/Pill';
import Kpi from '../components/ui/Kpi';
import { C } from '../theme/colors';
import { ALL_ENVS, getAiRecsForEnv, getEnvMetrics, formatSpend } from '../mock-data/envScope';

export default function AIInsights({ env = ALL_ENVS }) {
  const aiRecs = useMemo(() => getAiRecsForEnv(env), [env]);
  const metrics = useMemo(() => getEnvMetrics(env), [env]);

  return (
    <div className="space-y-5">
      <div className="azure-commandbar flex items-end justify-between px-5 py-4">
        <div>
          <div
            className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-1 flex items-center gap-2"
            style={{ color: C.inkMute }}
          >
            <Sparkles size={12} style={{ color: '#7c3aed' }} /> AI Security Layer
          </div>
          <h1 className="font-display text-2xl font-semibold" style={{ color: C.ink }}>
            AI security insights & model risk · {env}
          </h1>
          <div className="text-xs mt-1" style={{ color: C.inkSoft }}>
            Analyst-ready queue for model safety findings, guardrail violations, and automated containment.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone="accent">Guardrails active</Pill>
          <Pill tone="neutral">Last evaluated 2h ago</Pill>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3"><Kpi label="Active AI Alerts"   value={aiRecs.length}                icon={Brain} /></div>
        <div className="col-span-3"><Kpi label="Auto-Remediated"    value={String(metrics.aiAutoHealed)}  unit="/30d" tone="ok"    delta={34}  icon={Zap} /></div>
        <div className="col-span-3"><Kpi label="Model Confidence"   value={String(metrics.aiConfidence)}   unit="%"    tone="ok"    delta={3.2} icon={Gauge} /></div>
        <div className="col-span-3"><Kpi label="Risk Avoided"       value={formatSpend(metrics.costAvoided)}            tone="ok"    delta={18}  icon={ShieldCheck} /></div>
      </div>

      <div className="space-y-3">
        {aiRecs.map((rec) => (
          <Panel key={rec.id} padding="p-0" className="overflow-hidden">
            <div className="grid grid-cols-12 gap-0">
              <div
                className="col-span-1 flex flex-col items-center justify-center py-5 border-r"
                style={{
                  borderColor: C.border,
                  background:
                    rec.priority === 'P1' ? '#fef2f2' : rec.priority === 'P2' ? '#fffbeb' : '#eff6ff',
                }}
              >
                <Pill tone={rec.priority === 'P1' ? 'p1' : rec.priority === 'P2' ? 'p2' : 'p3'}>
                  {rec.priority}
                </Pill>
                <div
                  className="font-mono-num text-2xl font-bold mt-2"
                  style={{
                    color: rec.confidence >= 90 ? C.ok : rec.confidence >= 75 ? C.warn : C.crit,
                  }}
                >
                  {rec.confidence}
                </div>
                <div
                  className="text-[9px] uppercase tracking-widest font-semibold"
                  style={{ color: C.inkMute }}
                >
                  Confidence
                </div>
              </div>

              <div className="col-span-11 p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles size={12} style={{ color: '#7c3aed' }} />
                      <span
                        className="text-[10px] uppercase tracking-widest font-bold"
                        style={{ color: '#7c3aed' }}
                      >
                        {rec.id}
                      </span>
                      <span className="font-mono-num text-[10px]" style={{ color: C.inkMute }}>
                        · {rec.pattern}
                      </span>
                    </div>
                    <div
                      className="font-display font-semibold text-sm leading-snug"
                      style={{ color: C.ink }}
                    >
                      {rec.title}
                    </div>
                  </div>
                  <button
                    className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1.5 text-white flex items-center gap-1.5"
                    style={{ background: C.accent, borderRadius: 3 }}
                  >
                    <PlayCircle size={12} /> Apply
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-5 mt-4">
                  <div>
                    <div
                      className="text-[9px] uppercase tracking-widest font-semibold mb-1"
                      style={{ color: C.inkMute }}
                    >
                      Root cause
                    </div>
                    <div className="text-[11px]" style={{ color: C.inkSoft }}>
                      {rec.rootCause}
                    </div>
                  </div>
                  <div>
                    <div
                      className="text-[9px] uppercase tracking-widest font-semibold mb-1"
                      style={{ color: C.inkMute }}
                    >
                      Suggested action
                    </div>
                    <div className="text-[11px]" style={{ color: C.inkSoft }}>
                      {rec.suggestion}
                    </div>
                  </div>
                  <div>
                    <div
                      className="text-[9px] uppercase tracking-widest font-semibold mb-1"
                      style={{ color: C.inkMute }}
                    >
                      Predicted impact
                    </div>
                    <div className="text-[11px]" style={{ color: C.inkSoft }}>
                      {rec.impact}
                    </div>
                  </div>
                </div>

                {rec.related.length > 0 && (
                  <div
                    className="mt-3 pt-3 border-t flex items-center gap-2"
                    style={{ borderColor: C.border }}
                  >
                    <span
                      className="text-[10px] uppercase tracking-wider font-semibold"
                      style={{ color: C.inkMute }}
                    >
                      Related:
                    </span>
                    {rec.related.map((r) => (
                      <span
                        key={r}
                        className="font-mono-num text-[10px] px-1.5 py-0.5"
                        style={{
                          background: C.panelAlt,
                          color: C.inkSoft,
                          borderRadius: 2,
                        }}
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
