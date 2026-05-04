'use client'
import { LineChart, Line, AreaChart, Area, ResponsiveContainer, Tooltip, YAxis, XAxis } from 'recharts'

export default function SensorDashboard({ sensor }) {
  const { connected, bpm, hrv, spo2, gsr, bpmHistory, loading, error, port } = sensor

  // Prepare data for charts
  const bpmChartData = bpmHistory.map((value, index) => ({
    time: index,
    bpm: value,
  }))

  const getBpmColor = (bpm) => {
    if (!bpm) return '#4A4760'
    if (bpm < 60) return '#3b82f6' // Blue - Low
    if (bpm < 100) return '#22c55e' // Green - Normal
    if (bpm < 140) return '#f59e0b' // Yellow - Elevated
    return '#ef4444' // Red - High
  }

  const getBpmZone = (bpm) => {
    if (!bpm) return 'Unknown'
    if (bpm < 60) return 'Low'
    if (bpm < 100) return 'Normal'
    if (bpm < 140) return 'Elevated'
    return 'High'
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Biometric Monitor
          </h3>
          <p className="text-sm text-gray-500">
            Real-time health metrics
          </p>
        </div>
        
        {/* Connection Status */}
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></div>
          <span className="text-sm font-medium text-gray-700">
            {connected ? `Connected` : 'Disconnected'}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        
        {/* BPM Card */}
        <div className="bg-gray-50 p-3 rounded-lg text-center">
          <div className="text-2xl font-bold mb-1" style={{ color: getBpmColor(bpm) }}>
            {bpm ? Math.round(bpm) : '--'}
          </div>
          <div className="text-xs text-gray-500">BPM</div>
          <div className="text-xs font-medium mt-1" style={{ color: getBpmColor(bpm) }}>
            {getBpmZone(bpm)}
          </div>
        </div>

        {/* SpO2 Card */}
        <div className="bg-gray-50 p-3 rounded-lg text-center">
          <div className="text-2xl font-bold mb-1" style={{ color: spo2 ? '#10b981' : '#6b7280' }}>
            {spo2 ? Math.round(spo2) : '--'}
          </div>
          <div className="text-xs text-gray-500">SpO2 (%)</div>
          <div className="text-xs font-medium mt-1" style={{ color: spo2 ? '#10b981' : '#6b7280' }}>
            {spo2 ? (spo2 >= 95 ? 'Good' : 'Low') : 'No data'}
          </div>
        </div>
      </div>

      {/* BPM Chart */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h4 className="text-sm font-semibold mb-3 text-gray-900">
          Heart Rate Trend
        </h4>
        
        {bpmChartData.length > 1 ? (
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={bpmChartData}>
                <defs>
                  <linearGradient id="bpmGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <YAxis 
                  domain={[40, 160]} 
                  stroke="#9ca3af"
                  strokeWidth={1}
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{ 
                    background: '#ffffff', 
                    border: '1px solid #e5e7eb', 
                    borderRadius: 6, 
                    fontSize: 11 
                  }}
                  labelFormatter={() => 'Time'}
                  formatter={(value) => [`${Math.round(value)} BPM`, 'Heart Rate']}
                />
                <Area
                  type="monotone" 
                  dataKey="bpm"
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  fill="url(#bpmGradient)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center">
            <div className="text-center">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-2"></div>
              <span className="text-xs text-gray-500">
                {loading ? 'Connecting...' : connected ? 'Waiting for data...' : 'Connect sensor'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Connection Info */}
      <div className="mt-3 p-2 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>Port: {port}</span>
          <span>Status: {connected ? 'Connected' : 'Disconnected'}</span>
          <span>Points: {bpmHistory.length}</span>
        </div>
      </div>
    </div>
  )
}
