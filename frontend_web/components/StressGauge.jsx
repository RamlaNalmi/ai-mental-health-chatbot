'use client'
import { STRESS_CONFIG } from '../lib/constants'

export default function StressGauge({ score = 0, label = 'no_stress', confidence = 0, size = 100 }) {
  const cfg    = STRESS_CONFIG[label] || STRESS_CONFIG.no_stress
  const r      = (size / 2) - 8
  const circ   = 2 * Math.PI * r
  const dash   = circ * Math.min(score, 1)
  const gap    = circ - dash
  const rot    = -90 // start from top

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Track */}
          <circle
            cx={size/2} cy={size/2} r={r}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="6"
          />
          {/* Progress */}
          <circle
            cx={size/2} cy={size/2} r={r}
            fill="none"
            stroke={cfg.color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={0}
            transform={`rotate(${rot} ${size/2} ${size/2})`}
            style={{ transition: 'stroke-dasharray 0.6s cubic-bezier(0.4,0,0.2,1), stroke 0.4s ease' }}
          />
        </svg>
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl leading-none" style={{ color: cfg.color }}>{cfg.icon}</span>
          <span className="text-[11px] font-semibold mt-0.5" style={{ color: cfg.color }}>{cfg.label}</span>
          <span className="text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {Math.round(score * 100)}%
          </span>
        </div>
      </div>
      {confidence > 0 && (
        <span className="text-[9px] text-[#4A4760]">
          {Math.round(confidence * 100)}% conf · {label.replace('_',' ')}
        </span>
      )}
    </div>
  )
}
