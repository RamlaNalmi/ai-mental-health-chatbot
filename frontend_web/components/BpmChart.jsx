'use client'
import { LineChart, Line, ResponsiveContainer, Tooltip, YAxis } from 'recharts'
import { BPM_ZONE_CONFIG } from '../lib/constants'

export default function BpmChart({ history = [], zone = 'unknown', bpm = null }) {
  const cfg  = BPM_ZONE_CONFIG[zone] || BPM_ZONE_CONFIG.unknown
  const data = history.map((v, i) => ({ i, bpm: v }))

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums" style={{ color: bpm ? cfg.color : '#4A4760' }}>
          {bpm ? Math.round(bpm) : '--'}
        </span>
        <span className="text-xs text-[#4A4760]">bpm</span>
        <span className="text-xs font-medium ml-auto" style={{ color: cfg.color }}>
          {cfg.label}
        </span>
      </div>

      {data.length > 1 ? (
        <div className="h-12">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <YAxis domain={['auto', 'auto']} hide />
              <Tooltip
                contentStyle={{ background: '#1E2230', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 8, fontSize: 11 }}
                labelFormatter={() => ''}
                formatter={v => [`${v} bpm`]}
              />
              <Line
                type="monotone" dataKey="bpm"
                stroke={cfg.color} strokeWidth={1.5}
                dot={false} isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-12 flex items-center">
          <span className="text-[11px] text-[#4A4760]">Waiting for data...</span>
        </div>
      )}
    </div>
  )
}
