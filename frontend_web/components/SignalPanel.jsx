'use client'
import StressGauge from './StressGauge'
import BpmChart from './BpmChart'
import { STRESS_CONFIG, BPM_ZONE_CONFIG, COGNITIVE_CONFIG } from '../lib/constants'

function Pill({ label, value, color, active }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all ${
      active
        ? 'bg-opacity-20 border-opacity-30'
        : 'border-[rgba(255,255,255,0.06)] bg-[#151821]'
    }`}
      style={active ? { backgroundColor: color + '18', borderColor: color + '40' } : {}}>
      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: active ? color : '#4A4760' }} />
      <span style={{ color: active ? color : '#4A4760' }}>{label}</span>
      {value && <span className="ml-auto font-medium" style={{ color: active ? color : '#4A4760' }}>{value}</span>}
    </div>
  )
}

export default function SignalPanel({
  fusion,
  sensor,
  webcam,
  baseline,
  bpmHistory = [],
  cognitiveLabel = null,
}) {
  const stressCfg    = STRESS_CONFIG[fusion.label]  || STRESS_CONFIG.no_stress
  const bpmCfg       = BPM_ZONE_CONFIG[sensor.zone] || BPM_ZONE_CONFIG.unknown
  const cognitiveCfg = COGNITIVE_CONFIG[cognitiveLabel]

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col gap-4 p-4 border-r border-[rgba(255,255,255,0.05)] overflow-y-auto">

      {/* Header */}
      <div>
        <p className="text-[11px] text-[#4A4760] uppercase tracking-widest font-medium mb-3">Wellbeing</p>

        {/* Fused stress gauge */}
        <div className="flex justify-center py-2">
          <StressGauge
            score={fusion.score}
            label={fusion.label}
            confidence={fusion.confidence}
            size={112}
          />
        </div>
      </div>

      {/* Alert banner */}
      {fusion.alert && fusion.alertReasons.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-900/20 px-3 py-2">
          <p className="text-[11px] text-red-400 font-medium">⚠ Alert</p>
          {fusion.alertReasons.map((r, i) => (
            <p key={i} className="text-[10px] text-red-400/70 mt-0.5">{r}</p>
          ))}
        </div>
      )}

      {/* BPM section */}
      <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[#151821] p-3">
        <p className="text-[10px] text-[#4A4760] uppercase tracking-wider mb-2">Heart Rate</p>
        <BpmChart history={bpmHistory} zone={sensor.zone} bpm={sensor.bpm} />
      </div>

      {/* Signals */}
      <div>
        <p className="text-[10px] text-[#4A4760] uppercase tracking-wider mb-2">Active Signals</p>
        <div className="flex flex-col gap-1.5">
          <Pill label="Text analysis"   active={true}               color="#7C6FCD" value={fusion.signalsUsed > 0 ? 'on' : null} />
          <Pill label="Voice"           active={false}              color="#5DCAA5" />
          <Pill label="Face detection"  active={webcam.active}      color="#EF9F27" value={webcam.active ? stressCfg.label : null} />
          <Pill label="BPM sensor"      active={sensor.connected}   color="#E24B4A" value={sensor.bpm ? `${Math.round(sensor.bpm)} bpm` : null} />
          <Pill label="Cognitive load"  active={!!cognitiveLabel}   color="#7C6FCD" value={cognitiveLabel || null} />
        </div>
      </div>

      {/* Baseline */}
      <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[#151821] p-3">
        <p className="text-[10px] text-[#4A4760] uppercase tracking-wider mb-2">Personalisation</p>
        {baseline.is_ready ? (
          <p className="text-xs text-[#5DCAA5]">✓ Baseline active</p>
        ) : (
          <>
            <div className="w-full bg-[#1E2230] rounded-full h-1 mb-1">
              <div
                className="h-1 rounded-full bg-[#7C6FCD] transition-all duration-500"
                style={{ width: `${Math.min((baseline.n_samples / 10) * 100, 100)}%` }}
              />
            </div>
            <p className="text-[10px] text-[#4A4760]">{baseline.n_samples}/10 samples</p>
          </>
        )}
      </div>

      {/* KG coping hints */}
      {fusion.dashboard?.coping_actions?.length > 0 && (
        <div>
          <p className="text-[10px] text-[#4A4760] uppercase tracking-wider mb-2">Suggested coping</p>
          <div className="flex flex-col gap-1">
            {fusion.dashboard.coping_actions.slice(0, 3).map((a, i) => (
              <div key={i} className="text-[11px] text-[#8B87A8] px-2 py-1.5 rounded-lg bg-[#1E2230]">
                {a.label}
              </div>
            ))}
          </div>
        </div>
      )}

    </aside>
  )
}
