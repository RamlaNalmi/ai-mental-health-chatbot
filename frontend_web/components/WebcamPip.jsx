const BORDER = {
  no_stress: '#374151',
  low:       '#3b82f6',
  moderate:  '#f59e0b',
  high:      '#ef4444',
}

export default function WebcamPip({
  frameUrl,
  active,
  stressLevel,
  faceDetected,
  faceScore,
  loading,
  fps,
  onToggle,
}) {
  const color = BORDER[stressLevel] ?? BORDER.no_stress

  return (
    <div className="flex flex-col items-center gap-1 flex-shrink-0">

      {/* The pip itself */}
      <div
        className="relative w-24 h-16 rounded-xl overflow-hidden border-2 bg-[#1E2230] transition-all duration-300"
        style={{ borderColor: color }}
      >
        {/* Live annotated frame from backend */}
        {/* Live camera feed from backend */}
        {active && frameUrl ? (
          <img
            src={frameUrl}
            alt="Camera feed"
            className="w-full h-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="#4A4760" strokeWidth="1.5">
              <path d="M23 7l-7 5 7 5V7z"/>
              <rect x="1" y="5" width="15" height="14" rx="2"/>
            </svg>
          </div>
        )}

        {/* Face detected dot */}
        {active && (
          <div
            className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full border border-black/20 transition-colors duration-500"
            style={{ backgroundColor: faceDetected ? '#22c55e' : '#6b7280' }}
          />
        )}

        {/* Score badge */}
        {active && faceDetected && (
          <div className="absolute bottom-1 left-1 text-[9px] font-mono px-1 rounded"
            style={{ backgroundColor: color + 'cc', color: '#fff' }}>
            {Math.round(faceScore * 100)}%
          </div>
        )}
      </div>

      {/* Toggle button */}
      <button
        onClick={onToggle}
        disabled={loading}
        className="text-[10px] px-2 py-0.5 rounded-full border transition-all"
        style={{
          borderColor: active ? color : '#374151',
          color: active ? color : '#6b7280',
          backgroundColor: active ? color + '15' : 'transparent',
        }}
      >
        {loading ? 'starting…' : active ? 'camera on' : 'camera off'}
      </button>

      {/* Stress label */}
      {active && stressLevel !== 'no_stress' && (
        <p className="text-[9px]" style={{ color }}>
          {stressLevel}
        </p>
      )}
    </div>
  )
}