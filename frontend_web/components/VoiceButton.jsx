'use client'

export default function VoiceButton({ recording, processing, seconds, onToggle }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onToggle}
        disabled={processing}
        className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-all ${
          recording
            ? 'bg-red-500/20 border border-red-500/50'
            : 'bg-[#1E2230] border border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.15)]'
        } ${processing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        title={recording ? 'Stop recording' : 'Record voice'}
      >
        {processing ? (
          <div className="w-3 h-3 rounded-full border-2 border-[#7C6FCD] border-t-transparent animate-spin" />
        ) : recording ? (
          <>
            {/* Pulsing ring */}
            <div className="absolute inset-0 rounded-full border border-red-500/40 animate-ping" />
            <div className="w-2.5 h-2.5 rounded-sm bg-red-500" />
          </>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" className="text-[#8B87A8]">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        )}
      </button>
      {recording && (
        <span className="text-xs text-red-400 tabular-nums">{seconds}s</span>
      )}
    </div>
  )
}
