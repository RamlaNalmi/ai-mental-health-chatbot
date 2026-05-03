import { STRESS_CONFIG } from '../lib/constants'

export default function MessageBubble({ message }) {
  const { role, content, timestamp, meta } = message
  const isUser   = role === 'user'
  const isSystem = role === 'system'

  if (isSystem) {
    return (
      <div className="flex justify-center animate-fade-up">
        <div className="px-3 py-1.5 rounded-full border border-[rgba(255,255,255,0.06)] bg-[#1E2230]">
          <p className="text-[11px] text-[#8B87A8]">{content}</p>
        </div>
      </div>
    )
  }

  const stressCfg = meta?.fused_label ? STRESS_CONFIG[meta.fused_label] : null

  return (
    <div className={`flex gap-3 animate-fade-up ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-[#3D3669] border border-[#7C6FCD]/40 flex items-center justify-center flex-shrink-0 mt-1">
          <span className="text-[11px] font-bold text-[#7C6FCD]">M</span>
        </div>
      )}

      <div className={`flex flex-col gap-1 max-w-[70%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
          isUser
            ? 'bg-[#7C6FCD] text-white rounded-tr-sm'
            : 'bg-[#1E2230] text-[#F0EEF9] border border-[rgba(255,255,255,0.06)] rounded-tl-sm'
        }`}>
          {content}
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] text-[#4A4760]">
            {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {meta?.stress_label !== undefined && (
            <span className={`text-[10px] font-medium ${meta.stress_label === 1 ? 'text-red-400' : 'text-emerald-400'}`}>
              {meta.stress_label === 1 ? '↑ stress' : '✓ calm'}
            </span>
          )}
          {stressCfg && (
            <span className="text-[10px]" style={{ color: stressCfg.color }}>
              {stressCfg.icon} {stressCfg.label}
            </span>
          )}
          {meta?.predicted_label && (
            <span className="text-[10px] text-[#8B87A8]">
              load: {meta.predicted_label}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
