'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { chatAPI, baselineAPI, sensorAPI } from '../../services/api'
import { useKeystrokes } from '../../hooks/useKeystrokes'
import { useWebcam } from '../../hooks/useWebcam'
import { useVoice } from '../../hooks/useVoice'
import { useSensor } from '../../hooks/useSensor'

// ─── tiny inline components so the file is self-contained ───────────────────

function StressBadge({ label }) {
  const map = {
    high:      { bg: '#FAECE7', color: '#993C1D', dot: '#D85A30' },
    moderate:  { bg: '#FAEEDA', color: '#854F0B', dot: '#BA7517' },
    low:       { bg: '#E1F5EE', color: '#0F6E56', dot: '#1D9E75' },
    no_stress: { bg: '#EEEDFE', color: '#534AB7', dot: '#7F77DD' },
    calm:      { bg: '#EEEDFE', color: '#534AB7', dot: '#7F77DD' },
    stressed:  { bg: '#FAECE7', color: '#993C1D', dot: '#D85A30' },
  }
  const s = map[label] || map.no_stress
  return (
    <span style={{
      fontSize: 10, background: s.bg, color: s.color,
      padding: '2px 7px', borderRadius: 5, fontWeight: 500,
      display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
      {label?.replace('_', ' ') || 'calm'}
    </span>
  )
}

function Sparkline({ data = [], width = 140, height = 32, color = '#7F77DD' }) {
  if (data.length < 2) return (
    <svg width={width} height={height}>
      <line x1={0} y1={height / 2} x2={width} y2={height / 2}
        stroke={color} strokeWidth={1} strokeDasharray="3 3" opacity={0.4} />
    </svg>
  )
  const mn = Math.min(...data), mx = Math.max(...data)
  const range = mx - mn || 1
  const step = width / (data.length - 1)
  const pts = data.map((v, i) => `${i * step},${height - 4 - ((v - mn) / range) * (height - 8)}`).join(' ')
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5}
        strokeLinecap="round" strokeLinejoin="round" />
      {/* last dot */}
      <circle
        cx={(data.length - 1) * step}
        cy={height - 4 - ((data[data.length - 1] - mn) / range) * (height - 8)}
        r={3} fill={color}
      />
    </svg>
  )
}

function MicIcon({ size = 14, color = '#534AB7' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
      stroke="white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: 'rotate(-90deg)' }}>
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  )
}

// ─── mock past sessions for history sidebar ──────────────────────────────────
const MOCK_HISTORY = [
  { id: 1, date: 'Today · 2:30 pm',  preview: 'Feeling overwhelmed with exams…',     label: 'moderate' },
  { id: 2, date: 'Yesterday',         preview: 'Assignment deadline was stressing…',  label: 'low'      },
  { id: 3, date: 'Mon, 28 Apr',       preview: "Can't focus on anything today…",      label: 'high'     },
  { id: 4, date: 'Sun, 27 Apr',       preview: 'Had a good study session finally!',   label: 'no_stress'},
]

// ─── helpers ─────────────────────────────────────────────────────────────────
function bpmZoneColor(bpm) {
  if (!bpm) return '#7F77DD'
  if (bpm < 60)  return '#378ADD'
  if (bpm < 100) return '#1D9E75'
  if (bpm < 120) return '#BA7517'
  return '#D85A30'
}

function bpmZoneLabel(bpm) {
  if (!bpm) return 'no data'
  if (bpm < 60)  return 'low'
  if (bpm < 100) return 'normal'
  if (bpm < 120) return 'elevated'
  return 'high'
}

// ─── main page ───────────────────────────────────────────────────────────────
export default function ChatPage() {
  const router = useRouter()

  const [sessionId,  setSessionId]  = useState(null)
  const [messages,   setMessages]   = useState([])
  const [input,      setInput]      = useState('')
  const [sending,    setSending]    = useState(false)
  const [cogLabel,   setCogLabel]   = useState(null)
  const [baseline,   setBaseline]   = useState({ is_ready: false, n_samples: 0 })
  const [bpmHistory, setBpmHistory] = useState([])
  const [activeSession, setActiveSession] = useState(null) // for history highlight

  const bottomRef = useRef(null)
  const inputRef  = useRef(null)
  const { onKeyDown, flush } = useKeystrokes()

  const sensor = useSensor()

  const webcam = useWebcam({
    onStressDetected: () => {},
  })

  const voice = useVoice({
    onResult: async (audioData) => {
      if (!audioData.success || !audioData.transcript) {
        pushMessage({ role: 'system', content: 'Could not process audio. Please try again.' })
        return
      }
      pushMessage({ role: 'user', content: audioData.transcript })
      setSending(true)
      try {
        const resp = await chatAPI.sendMessage(sessionId, audioData.transcript, [], audioData.voice_score)
        pushMessage({
          role: 'assistant', content: resp.reply,
          meta: { stress_label: resp.stress_label, fused_label: resp.fused_label, predicted_label: resp.predicted_label },
        })
        if (resp.predicted_label) setCogLabel(resp.predicted_label)
        if (resp.baseline_ready !== undefined) setBaseline(b => ({ ...b, is_ready: resp.baseline_ready }))
      } catch (err) {
        pushMessage({ role: 'system', content: 'Voice message failed. Please try again.' })
      } finally {
        setSending(false)
      }
    },
  })

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) router.replace('/signin')
    initChat()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  useEffect(() => {
    if (sensor.bpm) setBpmHistory(h => [...h.slice(-79), sensor.bpm])
  }, [sensor.bpm])

  const pushMessage = useCallback((msg) => {
    setMessages(prev => [...prev, { id: Date.now() + Math.random(), timestamp: new Date().toISOString(), ...msg }])
  }, [])

  const initChat = async () => {
    try {
      const session = await chatAPI.startSession()
      setSessionId(session.session_id)
      const bl = await baselineAPI.getStatus()
      setBaseline(bl)
      pushMessage({ role: 'system', content: 'Session started. How are you feeling today?' })
    } catch (e) {
      if (e.response?.status === 401) { router.replace('/signin'); return }
      pushMessage({ role: 'system', content: 'Failed to start session. Please refresh.' })
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || !sessionId || sending) return
    const text = input.trim()
    const ks   = flush()
    setInput('')
    setSending(true)
    pushMessage({ role: 'user', content: text })
    try {
      const resp = await chatAPI.sendMessage(sessionId, text, ks)
      pushMessage({
        role: 'assistant', content: resp.reply,
        meta: { stress_label: resp.stress_label, fused_label: resp.fused_label, predicted_label: resp.predicted_label },
      })
      if (resp.predicted_label) setCogLabel(resp.predicted_label)
      if (resp.baseline_ready !== undefined) setBaseline(b => ({ ...b, is_ready: resp.baseline_ready }))
    } catch (e) {
      if (e.response?.status === 401) { router.replace('/signin'); return }
      pushMessage({ role: 'system', content: 'Message failed. Check your connection.' })
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e) => {
    onKeyDown(e)
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const signOut = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    router.replace('/signin')
  }

  // derived
  const fusedLabel  = messages.filter(m => m.meta?.fused_label).slice(-1)[0]?.meta?.fused_label || 'calm'
  const fusedScore  = 28 // placeholder — wire to resp.fused_score if you want live
  const bpmColor    = bpmZoneColor(sensor.bpm)
  const bpmLabel    = bpmZoneLabel(sensor.bpm)

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;1,400&family=DM+Sans:wght@300;400;500&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --purple-50:  #EEEDFE;
          --purple-200: #AFA9EC;
          --purple-400: #7F77DD;
          --purple-600: #534AB7;
          --purple-800: #3C3489;
          --teal-50:    #E1F5EE;
          --teal-400:   #1D9E75;
          --coral-50:   #FAECE7;
          --coral-400:  #D85A30;
          --coral-600:  #993C1D;
          --amber-50:   #FAEEDA;
          --amber-400:  #BA7517;
          --surface:    #FAFAFA;
          --card:       #FFFFFF;
          --border:     rgba(0,0,0,0.07);
          --border-m:   rgba(0,0,0,0.12);
          --text-1:     #18181B;
          --text-2:     #52525B;
          --text-3:     #A1A1AA;
          --font-display: 'Lora', Georgia, serif;
          --font-body:    'DM Sans', system-ui, sans-serif;
        }

        body { font-family: var(--font-body); }

        .chat-root {
          display: grid;
          grid-template-columns: 320px 1fr 280px;
          height: 100vh;
          overflow: hidden;
          background: var(--surface);
          font-family: var(--font-body);
        }

        /* ── scrollbars ── */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--purple-200); border-radius: 4px; }

        /* ── left sidebar ── */
        .sidebar-left {
          border-right: 0.5px solid var(--border);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: var(--card);
        }

        .sidebar-header {
          padding: 18px 16px 12px;
          border-bottom: 0.5px solid var(--border);
        }

        .sidebar-logo {
          font-family: var(--font-display);
          font-size: 17px;
          color: var(--purple-600);
          margin-bottom: 2px;
        }

        .sidebar-logo em {
          color: var(--purple-400);
          font-style: italic;
        }

        .sidebar-sub {
          font-size: 14px;
          color: var(--text-3);
          font-family: var(--font-body);
        }

        .history-label {
          padding: 12px 16px 6px;
          font-size: 12px;
          font-weight: 500;
          color: var(--text-3);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .history-list {
          flex: 1;
          overflow-y: auto;
          padding: 0 8px 8px;
        }

        .history-item {
          padding: 9px 10px;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.15s;
          margin-bottom: 2px;
          position: relative;
        }

        .history-item:hover { background: var(--purple-50); }

        .history-item.active {
          background: var(--purple-50);
          border-left: 2.5px solid var(--purple-400);
          padding-left: 8px;
        }

        .history-date {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-1);
          margin-bottom: 2px;
        }

        .history-preview {
          font-size: 12px;
          color: var(--text-3);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 4px;
        }

        .sidebar-footer {
          padding: 10px 14px;
          border-top: 0.5px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .new-session-btn {
          font-size: 12px;
          font-weight: 500;
          color: var(--purple-600);
          background: var(--purple-50);
          border: none;
          border-radius: 6px;
          padding: 5px 10px;
          cursor: pointer;
          font-family: var(--font-body);
          transition: background 0.15s;
        }
        .new-session-btn:hover { background: var(--purple-200); }

        .signout-btn {
          font-size: 12px;
          color: var(--text-3);
          background: none;
          border: none;
          cursor: pointer;
          font-family: var(--font-body);
          transition: color 0.15s;
        }
        .signout-btn:hover { color: var(--text-2); }

        /* ── main chat ── */
        .chat-main {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .chat-header {
          padding: 12px 20px;
          border-bottom: 0.5px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--card);
          flex-shrink: 0;
        }

        .chat-header-title {
          font-family: var(--font-display);
          font-size: 16px;
          color: var(--purple-600);
        }

        .chat-header-meta {
          font-size: 12px;
          color: var(--text-3);
          margin-top: 1px;
        }

        .header-pills {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          font-size: 13px;
          padding: 4px 11px;
          border-radius: 20px;
          font-weight: 500;
        }

        .pill-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }

        .messages-area {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        /* ── message bubbles ── */
        .msg-row {
          display: flex;
          gap: 10px;
          animation: fadeUp 0.2s ease-out both;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .msg-row.user { flex-direction: row-reverse; }

        .msg-avatar {
          width: 28px;
          height: 28px;
          border-radius: 7px;
          background: var(--purple-400);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-size: 11px;
          font-weight: 500;
          color: #fff;
          margin-top: 2px;
        }

        .msg-body { max-width: 72%; }

        .bubble {
          padding: 10px 15px;
          font-size: 15px;
          line-height: 1.55;
          color: var(--text-1);
        }

        .bubble-assistant {
          background: var(--card);
          border: 0.5px solid var(--border-m);
          border-radius: 3px 12px 12px 12px;
        }

        .bubble-user {
          background: var(--purple-400);
          color: #fff;
          border-radius: 12px 3px 12px 12px;
        }

        .bubble-system {
          background: transparent;
          border: 0.5px dashed var(--border-m);
          border-radius: 8px;
          font-size: 11px;
          color: var(--text-3);
          text-align: center;
        }

        .msg-meta {
          margin-top: 4px;
          display: flex;
          gap: 5px;
          align-items: center;
        }

        .msg-time {
          font-size: 12px;
          color: var(--text-3);
        }

        /* ── typing indicator ── */
        .typing-dots {
          display: flex;
          gap: 4px;
          align-items: center;
          padding: 12px 16px;
        }

        .typing-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--purple-400);
          animation: typingBounce 1.2s ease-in-out infinite;
        }
        .typing-dot:nth-child(2) { animation-delay: 0.15s; }
        .typing-dot:nth-child(3) { animation-delay: 0.30s; }

        @keyframes typingBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
          40%            { transform: translateY(-5px); opacity: 1; }
        }

        /* ── input bar ── */
        .input-area {
          padding: 12px 20px 16px;
          border-top: 0.5px solid var(--border);
          background: var(--card);
          flex-shrink: 0;
        }

        .input-row {
          display: flex;
          align-items: flex-end;
          gap: 8px;
          background: var(--surface);
          border: 1px solid var(--border-m);
          border-radius: 14px;
          padding: 8px 10px;
          transition: border-color 0.2s;
        }

        .input-row:focus-within { border-color: var(--purple-200); }

        .input-textarea {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          resize: none;
          font-size: 15px;
          font-family: var(--font-body);
          color: var(--text-1);
          line-height: 1.5;
          max-height: 120px;
          overflow-y: auto;
        }

        .input-textarea::placeholder { color: var(--text-3); font-size: 15px; }

        .input-btn {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: all 0.15s;
          font-size: 12px;
        }

        .btn-mic {
          background: var(--purple-50);
          color: var(--purple-600);
        }
        .btn-mic:hover  { background: var(--purple-200); }
        .btn-mic.active { background: #FAECE7; }

        .btn-send {
          background: var(--purple-400);
        }
        .btn-send:hover   { background: var(--purple-600); }
        .btn-send:disabled { background: var(--purple-200); cursor: not-allowed; }

        .input-hint {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 6px;
          padding: 0 2px;
        }

        .input-hint-text {
          font-size: 12px;
          color: var(--text-3);
        }

        .connect-sensor-btn {
          font-size: 12px;
          color: var(--purple-600);
          background: none;
          border: none;
          cursor: pointer;
          font-family: var(--font-body);
          text-decoration: underline;
        }

        /* ── right panel ── */
        .sidebar-right {
          border-left: 0.5px solid var(--border);
          display: flex;
          flex-direction: column;
          gap: 0;
          overflow-y: auto;
          background: var(--card);
        }

        .right-section {
          padding: 12px 14px;
          border-bottom: 0.5px solid var(--border);
        }

        .section-label {
          font-size: 10px;
          font-weight: 500;
          color: var(--text-3);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        /* webcam */
        .webcam-feed {
          width: 100%;
          aspect-ratio: 4/3;
          background: #0f0e17;
          border-radius: 10px;
          overflow: hidden;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .webcam-feed img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .webcam-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }

        .webcam-icon-ring {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 1.5px solid rgba(127,119,221,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .webcam-badge {
          position: absolute;
          top: 6px;
          right: 6px;
          font-size: 9px;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 500;
        }

        .webcam-badge.live {
          background: rgba(29,158,117,0.2);
          color: #1D9E75;
          border: 0.5px solid rgba(29,158,117,0.4);
        }

        .webcam-badge.off {
          background: rgba(0,0,0,0.4);
          color: rgba(255,255,255,0.5);
        }

        .webcam-stress-label {
          position: absolute;
          bottom: 6px;
          left: 6px;
          font-size: 9px;
          padding: 2px 7px;
          border-radius: 4px;
          background: rgba(127,119,221,0.85);
          color: #fff;
          font-weight: 500;
        }

        .webcam-toggle {
          width: 100%;
          margin-top: 7px;
          font-size: 11px;
          font-weight: 500;
          padding: 5px 0;
          border-radius: 7px;
          border: 0.5px solid var(--border-m);
          background: var(--surface);
          color: var(--text-2);
          cursor: pointer;
          font-family: var(--font-body);
          transition: background 0.15s;
        }
        .webcam-toggle:hover { background: var(--purple-50); color: var(--purple-600); }

        /* BPM card */
        .bpm-number {
          font-size: 28px;
          font-weight: 300;
          font-family: var(--font-display);
          line-height: 1;
          letter-spacing: -1px;
        }

        .bpm-row {
          display: flex;
          align-items: baseline;
          gap: 6px;
          margin-bottom: 4px;
        }

        .bpm-unit {
          font-size: 11px;
          color: var(--text-3);
        }

        /* small metrics row */
        .metrics-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .metric-card {
          background: var(--surface);
          border-radius: 8px;
          padding: 8px 10px;
          border: 0.5px solid var(--border);
        }

        .metric-label {
          font-size: 10px;
          color: var(--text-3);
          margin-bottom: 2px;
        }

        .metric-value {
          font-size: 17px;
          font-weight: 500;
          color: var(--text-1);
          font-family: var(--font-display);
        }

        .metric-sub {
          font-size: 12px;
          color: var(--text-3);
          margin-top: 1px;
        }

        /* fusion bar */
        .fusion-card {
          background: var(--purple-50);
          border: 0.5px solid var(--purple-200);
          border-radius: 10px;
          padding: 10px 12px;
          margin: 12px 14px;
        }

        .fusion-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
        }

        .fusion-title {
          font-size: 10px;
          font-weight: 500;
          color: var(--purple-600);
          letter-spacing: 0.04em;
        }

        .fusion-score {
          font-size: 13px;
          font-weight: 500;
          color: var(--purple-600);
          font-family: var(--font-display);
        }

        .fusion-bar-bg {
          height: 4px;
          background: var(--purple-200);
          border-radius: 2px;
          overflow: hidden;
          margin-bottom: 5px;
        }

        .fusion-bar-fill {
          height: 100%;
          border-radius: 2px;
          background: var(--purple-600);
          transition: width 0.6s ease;
        }

        .fusion-signals {
          font-size: 10px;
          color: var(--purple-400);
        }

        /* voice banner */
        .voice-banner {
          padding: 8px 20px;
          background: var(--purple-50);
          border-bottom: 0.5px solid var(--purple-200);
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }

        .voice-waves {
          display: flex;
          align-items: flex-end;
          gap: 2px;
          height: 16px;
        }

        .voice-wave-bar {
          width: 2px;
          border-radius: 2px;
          background: var(--purple-400);
          animation: waveAnim 0.8s ease-in-out infinite alternate;
        }

        @keyframes waveAnim {
          from { height: 30%; }
          to   { height: 100%; }
        }

        .voice-text {
          font-size: 11px;
          color: var(--purple-600);
        }

        /* recording pulse on mic button */
        @keyframes recordPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(216,90,48,0.4); }
          50%       { box-shadow: 0 0 0 6px rgba(216,90,48,0); }
        }
        .btn-mic.recording { animation: recordPulse 1s infinite; background: #FAECE7; }
      `}</style>

      <div className="chat-root">

        {/* ── LEFT SIDEBAR: history ── */}
        <aside className="sidebar-left">
          <div className="sidebar-header">
            <p className="sidebar-logo">Mindful<em>Chat</em></p>
            <p className="sidebar-sub">
              {baseline.is_ready
                ? 'Personalized · active'
                : `Building baseline · ${baseline.n_samples}/10`}
            </p>
          </div>

          <p className="history-label">Sessions</p>

          <div className="history-list">
            {/* current session */}
            <div className="history-item active">
              <div className="history-date">Now · active</div>
              <div className="history-preview">
                {messages.filter(m => m.role === 'user').slice(-1)[0]?.content || 'New session'}
              </div>
              <StressBadge label={fusedLabel} />
            </div>

            {/* past sessions */}
            {MOCK_HISTORY.map(s => (
              <div key={s.id}
                className={`history-item ${activeSession === s.id ? 'active' : ''}`}
                onClick={() => setActiveSession(s.id)}
              >
                <div className="history-date">{s.date}</div>
                <div className="history-preview">{s.preview}</div>
                <StressBadge label={s.label} />
              </div>
            ))}
          </div>

          <div className="sidebar-footer">
            <button className="new-session-btn" onClick={() => { setMessages([]); initChat() }}>
              + New session
            </button>
            <button className="signout-btn" onClick={signOut}>Sign out</button>
          </div>
        </aside>

        {/* ── MAIN CHAT ── */}
        <main className="chat-main">

          {/* header */}
          <header className="chat-header">
            <div>
              <p className="chat-header-title">How are you feeling?</p>
              <p className="chat-header-meta">
                Keystrokes tracked ·{' '}
                {webcam.active ? `Face active · ${webcam.stressLevel ?? 'detecting'}` : 'Face off'} ·{' '}
                {sensor.connected ? `BPM ${sensor.bpm ? Math.round(sensor.bpm) : '…'}` : 'Sensor off'}
              </p>
            </div>
            <div className="header-pills">
              <div className="pill" style={{ background: 'var(--purple-50)', color: 'var(--purple-600)' }}>
                <span className="pill-dot" style={{ background: 'var(--purple-400)', animation: 'recordPulse 2s infinite' }} />
                {fusedLabel}
              </div>
              {cogLabel && (
                <div className="pill" style={{ background: '#E1F5EE', color: '#0F6E56' }}>
                  <span className="pill-dot" style={{ background: '#1D9E75' }} />
                  cog: {cogLabel}
                </div>
              )}
            </div>
          </header>

          {/* voice banner */}
          {(voice.recording || voice.processing || voice.transcript) && (
            <div className="voice-banner">
              {voice.recording && (
                <>
                  <div className="voice-waves">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="voice-wave-bar"
                        style={{ animationDelay: `${i * 0.08}s`, height: `${30 + Math.random() * 70}%` }} />
                    ))}
                  </div>
                  <span className="voice-text">Recording · {voice.seconds}s · click mic to stop</span>
                </>
              )}
              {voice.processing && <span className="voice-text">Processing audio…</span>}
              {!voice.recording && !voice.processing && voice.transcript && (
                <span className="voice-text">"{voice.transcript}"</span>
              )}
            </div>
          )}

          {/* messages */}
          <div className="messages-area">
            {messages.map(msg => {
              if (msg.role === 'system') return (
                <div key={msg.id} className="msg-row">
                  <div style={{ width: '100%' }}>
                    <div className="bubble bubble-system">{msg.content}</div>
                  </div>
                </div>
              )

              const isUser = msg.role === 'user'
              const time   = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

              return (
                <div key={msg.id} className={`msg-row ${isUser ? 'user' : ''}`}>
                  {!isUser && (
                    <div className="msg-avatar">MC</div>
                  )}
                  <div className="msg-body">
                    <div className={`bubble ${isUser ? 'bubble-user' : 'bubble-assistant'}`}>
                      {msg.content}
                    </div>
                    <div className={`msg-meta ${isUser ? '' : ''}`} style={{ justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                      <span className="msg-time">{time}</span>
                      {msg.meta?.fused_label && <StressBadge label={msg.meta.fused_label} />}
                    </div>
                  </div>
                </div>
              )
            })}

            {sending && (
              <div className="msg-row" style={{ animation: 'fadeUp 0.2s ease-out' }}>
                <div className="msg-avatar">MC</div>
                <div className="bubble bubble-assistant">
                  <div className="typing-dots">
                    <div className="typing-dot" />
                    <div className="typing-dot" />
                    <div className="typing-dot" />
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* input */}
          <div className="input-area">
            <div className="input-row">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="What's on your mind?"
                rows={1}
                className="input-textarea"
              />
              <button
                className={`input-btn btn-mic ${voice.recording ? 'recording active' : ''}`}
                onClick={voice.toggle}
                title={voice.recording ? 'Stop recording' : 'Start voice message'}
              >
                <MicIcon color={voice.recording ? '#D85A30' : '#534AB7'} />
              </button>
              <button
                className="input-btn btn-send"
                onClick={sendMessage}
                disabled={!input.trim() || sending}
              >
                {sending ? (
                  <div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                ) : (
                  <SendIcon />
                )}
              </button>
            </div>
            <div className="input-hint">
              <span className="input-hint-text">
                Enter to send · Shift+Enter for new line
              </span>
              {!sensor.connected && (
                <button className="connect-sensor-btn"
                  onClick={() => sensorAPI.connect().catch(() => {})}>
                  Connect sensor
                </button>
              )}
            </div>
          </div>
        </main>

        {/* ── RIGHT PANEL ── */}
        <aside className="sidebar-right">

          {/* webcam */}
          <div className="right-section">
            <p className="section-label">Face</p>
            <div className="webcam-feed">
              {webcam.active && webcam.streamUrl ? (
                <img src={webcam.streamUrl} alt="webcam" />
              ) : (
                <div className="webcam-placeholder">
                  <div className="webcam-icon-ring">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                      stroke="rgba(127,119,221,0.7)" strokeWidth="1.5">
                      <path d="M23 7l-7 5 7 5V7z" />
                      <rect x="1" y="5" width="15" height="14" rx="2" />
                    </svg>
                  </div>
                  <span style={{ fontSize: 10, color: 'rgba(127,119,221,0.5)' }}>camera off</span>
                </div>
              )}
              <span className={`webcam-badge ${webcam.active ? 'live' : 'off'}`}>
                {webcam.active ? 'LIVE' : 'OFF'}
              </span>
              {webcam.active && (
                <span className="webcam-stress-label">
                  {webcam.stressLevel || 'detecting…'}
                </span>
              )}
            </div>
            <button className="webcam-toggle" onClick={webcam.toggle}>
              {webcam.active ? 'Turn off camera' : 'Turn on camera'}
            </button>
          </div>

          {/* heart rate */}
          <div className="right-section">
            <p className="section-label">Heart rate</p>
            <div className="bpm-row">
              <span className="bpm-number" style={{ color: bpmColor }}>
                {sensor.bpm ? Math.round(sensor.bpm) : '—'}
              </span>
              <span className="bpm-unit">bpm · {bpmLabel}</span>
            </div>
            <Sparkline data={bpmHistory.slice(-40)} width={166} height={32} color={bpmColor} />
          </div>

          {/* spo2 + gsr */}
          <div className="right-section">
            <p className="section-label">Biometrics</p>
            <div className="metrics-row">
              <div className="metric-card">
                <div className="metric-label">SpO₂</div>
                <div className="metric-value" style={{ color: sensor.spo2 ? '#1D9E75' : 'var(--text-3)' }}>
                  {sensor.spo2 ? `${Math.round(sensor.spo2)}%` : '—'}
                </div>
                <div className="metric-sub">{sensor.spo2 ? (sensor.spo2 >= 95 ? 'normal' : 'low') : 'no data'}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">GSR</div>
                <div className="metric-value" style={{ color: sensor.gsr ? '#BA7517' : 'var(--text-3)' }}>
                  {sensor.gsr ? sensor.gsr.toFixed(1) : '—'}
                </div>
                <div className="metric-sub">{sensor.gsr ? 'µS · active' : 'no data'}</div>
              </div>
            </div>
          </div>

          {/* cognitive load */}
          {cogLabel && (
            <div className="right-section">
              <p className="section-label">Cognitive load</p>
              <div className="metric-card" style={{ background: cogLabel === 'High' ? '#FAECE7' : cogLabel === 'Medium' ? '#FAEEDA' : '#E1F5EE' }}>
                <div className="metric-label">Predicted</div>
                <div className="metric-value" style={{ color: cogLabel === 'High' ? '#993C1D' : cogLabel === 'Medium' ? '#854F0B' : '#0F6E56', fontSize: 15 }}>
                  {cogLabel}
                </div>
                <div className="metric-sub">from typing patterns</div>
              </div>
            </div>
          )}

          {/* fusion score */}
          <div className="fusion-card">
            <div className="fusion-header">
              <span className="fusion-title">Fusion</span>
              <span className="fusion-score">{fusedLabel}</span>
            </div>
            <div className="fusion-bar-bg">
              <div className="fusion-bar-fill" style={{ width: `${fusedScore}%` }} />
            </div>
            <div className="fusion-signals">
              {sensor.connected ? 'text + face + heart' : 'text + face'}
            </div>
          </div>

          {/* sensor connection status */}
          <div style={{ padding: '10px 14px', marginTop: 'auto' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 10px', borderRadius: 8,
              background: sensor.connected ? 'var(--teal-50)' : 'var(--surface)',
              border: `0.5px solid ${sensor.connected ? 'rgba(29,158,117,0.3)' : 'var(--border)'}`,
            }}>
              <div style={{
                width: 7, height: 7, borderRadius: '50%',
                background: sensor.connected ? '#1D9E75' : 'var(--text-3)',
                flexShrink: 0,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 500, color: sensor.connected ? '#0F6E56' : 'var(--text-2)' }}>
                  {sensor.connected ? `Arduino · ${sensor.port}` : 'Arduino disconnected'}
                </div>
              </div>
              {!sensor.connected && (
                <button onClick={sensor.connect}
                  style={{
                    fontSize: 10, color: 'var(--purple-600)', background: 'var(--purple-50)',
                    border: 'none', borderRadius: 5, padding: '3px 7px', cursor: 'pointer',
                    fontFamily: 'var(--font-body)', fontWeight: 500,
                  }}>
                  Connect
                </button>
              )}
            </div>
          </div>

        </aside>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  )
}