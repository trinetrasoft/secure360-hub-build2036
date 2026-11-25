import React from 'react';
import {
  Boxes,
  BrainCircuit,
  ShieldCheck,
  Workflow,
  Waypoints,
} from 'lucide-react';
import Panel from '../components/ui/Panel';
import Pill from '../components/ui/Pill';
import SectionHead from '../components/ui/SectionHead';
import { C } from '../theme/colors';
import {
  ARCHITECTURE_DATA_PATHS,
  ARCHITECTURE_FLOW,
  ARCHITECTURE_KPIS,
  ARCHITECTURE_LAYERS,
  ARCHITECTURE_PRINCIPLES,
} from '../mock-data/architecture';

function KpiCard({ label, value, icon: Icon, tone = C.accent }) {
  return (
    <Panel className="col-span-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: C.inkMute }}>
            {label}
          </div>
          <div className="mt-3 font-display text-3xl font-semibold" style={{ color: C.ink }}>
            {value}
          </div>
        </div>
        <div className="p-2.5 rounded-sm" style={{ background: `${tone}18` }}>
          <Icon size={18} style={{ color: tone }} />
        </div>
      </div>
    </Panel>
  );
}

function ArchitectureConnector({ label = 'live path' }) {
  return (
    <div className="flex flex-col justify-center items-center min-w-[108px] px-1 pt-8">
      <div
        className="text-[9px] uppercase tracking-[0.16em] font-semibold mb-2"
        style={{ color: C.inkMute }}
      >
        {label}
      </div>
      <div className="flex items-center w-full">
        <div className="architecture-flow-line flex-1">
          <span className="architecture-flow-signal" />
        </div>
        <span className="architecture-flow-arrow" aria-hidden />
      </div>
    </div>
  );
}

export default function ArchitecturePage({ env }) {
  return (
    <div className="space-y-5">
      <div className="azure-commandbar flex items-end justify-between px-5 py-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-1" style={{ color: C.inkMute }}>
            Reference Architecture · {env}
          </div>
          <h1 className="font-display text-2xl font-semibold" style={{ color: C.ink }}>
            Secure360 platform flow & control architecture
          </h1>
          <div className="text-xs mt-1" style={{ color: C.inkSoft }}>
            End-to-end view of telemetry ingestion, governance, AI security, and response orchestration.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone="accent">Zero Trust</Pill>
          <Pill tone="neutral">AI-aware</Pill>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <KpiCard label="Control planes" value={ARCHITECTURE_KPIS.controlPlanes} icon={Boxes} />
        <KpiCard label="Security layers" value={ARCHITECTURE_KPIS.securityLayers} icon={ShieldCheck} tone={C.info} />
        <KpiCard label="Integrated platforms" value={ARCHITECTURE_KPIS.integratedPlatforms} icon={Waypoints} tone={C.warn} />
        <KpiCard label="Response channels" value={ARCHITECTURE_KPIS.responseChannels} icon={Workflow} tone="#7c3aed" />
      </div>

      <Panel>
        <SectionHead
          sub="Live architecture design"
          title="Architecture flow across the security command platform"
          action={<Pill tone="accent">Animated signal paths</Pill>}
        />
        <div className="overflow-x-auto scrollbar-thin pb-2">
          <div className="flex items-stretch gap-3 min-w-max pr-2">
            {ARCHITECTURE_FLOW.map((step, index) => (
              <React.Fragment key={step.id}>
                <div
                  className="architecture-node w-[255px] rounded border p-4 flex-shrink-0"
                  style={{
                    borderColor: C.border,
                    background: index % 2 === 0 ? C.panelAlt : C.panel,
                    borderRadius: 10,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className="text-[10px] uppercase tracking-[0.16em] font-semibold"
                      style={{ color: C.inkMute }}
                    >
                      {step.subtitle}
                    </div>
                    <Pill tone={step.tone} size="xs">{index + 1}</Pill>
                  </div>
                  <div className="mt-2 font-display text-base font-semibold" style={{ color: C.ink }}>
                    {step.title}
                  </div>
                  <div className="mt-3 space-y-2">
                    {step.items.map((item) => (
                      <div
                        key={item}
                        className="text-[12px] px-2.5 py-2 rounded-sm"
                        style={{ background: C.panelSoft, color: C.inkSoft, borderRadius: 6 }}
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                  <div
                    className="mt-4 pt-3 flex items-center justify-between border-t text-[11px] font-mono-num"
                    style={{ borderColor: C.border, color: C.inkMute }}
                  >
                    <span>Stage {index + 1}</span>
                    <span>Signal ready</span>
                  </div>
                </div>
                {index < ARCHITECTURE_FLOW.length - 1 && (
                  <ArchitectureConnector label={`to stage ${index + 2}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-12 gap-4">
        <Panel className="col-span-7">
          <SectionHead sub="Control stack" title="Security architecture layers" />
          <div className="space-y-3">
            {ARCHITECTURE_LAYERS.map((layer) => (
              <div key={layer.name} className="border rounded p-4" style={{ borderColor: C.border }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-display text-base font-semibold" style={{ color: C.ink }}>
                      {layer.name}
                    </div>
                    <div className="text-[12px] mt-1" style={{ color: C.inkSoft }}>
                      {layer.purpose}
                    </div>
                  </div>
                  <Pill tone="info">{layer.coverage}</Pill>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {layer.systems.map((system) => (
                    <Pill key={system} tone="neutral">{system}</Pill>
                  ))}
                </div>
                <div className="mt-3 text-[11px] font-mono-num" style={{ color: C.inkMute }}>
                  Owner · {layer.owner}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="col-span-5">
          <SectionHead sub="Design principles" title="Architecture decisions" action={<BrainCircuit size={16} style={{ color: '#7c3aed' }} />} />
          <div className="space-y-3">
            {ARCHITECTURE_PRINCIPLES.map((principle) => (
              <div key={principle.title} className="rounded border p-4" style={{ borderColor: C.border, background: C.panelAlt }}>
                <div className="font-display text-sm font-semibold" style={{ color: C.ink }}>
                  {principle.title}
                </div>
                <div className="text-[12px] mt-1.5 leading-relaxed" style={{ color: C.inkSoft }}>
                  {principle.detail}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel padding="p-0">
        <SectionHead sub="Data path mapping" title="How signals move through the platform" action={<Pill tone="accent">Live architecture map</Pill>} />
        <table className="azure-table w-full text-sm">
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.panelAlt }}>
              {['Source', 'Transport', 'Policy / Control', 'Outcome'].map((h) => (
                <th
                  key={h}
                  className="text-left font-semibold text-[10px] uppercase tracking-wider py-3 px-5"
                  style={{ color: C.inkMute }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ARCHITECTURE_DATA_PATHS.map((row) => (
              <tr key={row.source} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td className="py-3 px-5 font-medium" style={{ color: C.ink }}>{row.source}</td>
                <td className="py-3 px-5" style={{ color: C.inkSoft }}>{row.transport}</td>
                <td className="py-3 px-5" style={{ color: C.inkSoft }}>{row.policy}</td>
                <td className="py-3 px-5" style={{ color: C.inkSoft }}>{row.outcome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
