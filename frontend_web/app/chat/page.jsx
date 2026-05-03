'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { chatAPI, baselineAPI, sensorAPI } from '../../services/api'
import { useKeystrokes } from '../../hooks/useKeystrokes'
import { useWebcam } from '../../hooks/useWebcam'
import { useVoice } from '../../hooks/useVoice'
import { useSensor } from '../../hooks/useSensor'
import { useFusion } from '../../hooks/useFusion'
import MessageBubble from '../../components/MessageBubble'
import SignalPanel from '../../components/SignalPanel'
import WebcamPip from '../../components/WebcamPip'
import VoiceButton from '../../components/VoiceButton'
import { STRESS_CONFIG } from '../../lib/constants'

export default function ChatPage() {
  const router = useRouter()

  const [sessionId,  setSessionId]  = useState(null)
  const [messages,   setMessages]   = useState([])
  const [input,      setInput]      = useState('')
  const [sending,    setSending]    = useState(false)
  const [cogLabel,   setCogLabel]   = useState(null)
  const [baseline,   setBaseline]   = useState({ is_ready: false, n_samples: 0 })
  const [bpmHistory, setBpmHistory] = useState([])

  const bottomRef = useRef(null)
  const inputRef  = useRef(null)
  const { onKeyDown, flush } = useKeystrokes()

  const sensor = useSensor()
  const fusion = useFusion()

  // ── Webcam: backend camera, polls /camera/frame ──────────────────────
  const webcam = useWebcam({
    onStressDetected: (det) => {
      // optional: do something when stress_level === 'high'
    },
  })

  // ── Voice ───────────────────────────────────────────────────────────
  const voice = useVoice({
    onResult: (data) => {
      if (data.success && data.transcript) {
        pushMessage({
          role: 'assistant',
          content: `I heard: "${data.transcript}". ${
            data.final_label === 1
              ? "I can sense some stress in your voice — want to talk about it?"
              : "You sound fairly calm."
          }`,
          meta: { stress_label: data.final_label },
        })
      }
    },
  })

  // ── Init ────────────────────────────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      console.warn('[ChatPage] No access token found')
    }
    initChat()
  }, [])

  // ── Auto-scroll ─────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  // ── BPM history ─────────────────────────────────────────────────────
  useEffect(() => {
    if (sensor.bpm) {
      setBpmHistory(h => [...h.slice(-59), sensor.bpm])
    }
  }, [sensor.bpm])

  const pushMessage = useCallback((msg) => {
    setMessages(prev => [...prev, {
      id:        Date.now() + Math.random(),
      timestamp: new Date().toISOString(),
      ...msg,
    }])
  }, [])

  const initChat = async () => {
    try {
      console.log('[initChat] Starting chat session...')
      const session = await chatAPI.startSession()
      console.log('[initChat] Session started:', session)
      setSessionId(session.session_id)
      const bl = await baselineAPI.getStatus()
      setBaseline(bl)
      pushMessage({
        role: 'system',
        content: 'Session started. How are you feeling today?',
      })
    } catch (e) {
      if (e.response?.status === 401) { 
        console.log('[initChat] Unauthorized, redirecting to signin')
        router.replace('/signin'); return 
      }
      console.error('[initChat] Failed to start session:', e)
      pushMessage({ role: 'system', content: 'Failed to start chat session. Please refresh the page.' })
    }
  }

  const sendMessage = async () => {
    console.log('[sendMessage] Called', { input: input.trim(), sessionId, sending })
    if (!input.trim() || !sessionId || sending) {
      console.log('[sendMessage] Early return', { 
        hasInput: !!input.trim(), 
        hasSessionId: !!sessionId, 
        sending 
      })
      return
    }
    const text = input.trim()
    const ks   = flush()
    setInput('')
    setSending(true)

    pushMessage({ role: 'user', content: text })

    try {
      console.log('[sendMessage] Sending message', { sessionId, text, keystrokesCount: ks.length })
      // FIX: pass webcam.stressLevel as face_stress_level so backend fusion
      // uses the live face signal when processing each message
      const resp = await chatAPI.sendMessage(sessionId, text, ks)
      console.log('[sendMessage] Response received', resp)

      pushMessage({
        role: 'assistant',
        content: resp.reply,
        meta: {
          stress_label:    resp.stress_label,
          fused_label:     resp.fused_label,
          predicted_label: resp.predicted_label,
        },
      })
      if (resp.predicted_label) setCogLabel(resp.predicted_label)
      if (resp.baseline_ready !== undefined) setBaseline(b => ({ ...b, is_ready: resp.baseline_ready }))
    } catch (e) {
      console.error('[sendMessage] Error:', e)
      if (e.response?.status === 401) { 
        console.log('[sendMessage] Unauthorized, redirecting to signin')
        router.replace('/signin'); return 
      }
      pushMessage({ role: 'system', content: 'Message failed. Check your connection.' })
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e) => {
    onKeyDown(e)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const signOut = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    router.replace('/signin')
  }

  const fusionCfg = STRESS_CONFIG[fusion.label] || STRESS_CONFIG.no_stress

  return (
    <div className="flex h-screen overflow-hidden bg-[#0D0F14]">

      {/* ── Left sidebar ── */}
      <SignalPanel
        fusion={fusion}
        sensor={sensor}
        webcam={webcam}
        baseline={baseline}
        bpmHistory={bpmHistory}
        cognitiveLabel={cogLabel}
      />

      {/* ── Main chat column ── */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Header */}
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#3D3669] border border-[#7C6FCD]/40 flex items-center justify-center">
              <span className="text-sm font-bold text-[#7C6FCD]">M</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#F0EEF9]">Mira</p>
              <p className="text-[10px] text-[#4A4760]">
                {baseline.is_ready
                  ? 'Personalised · active'
                  : `Learning baseline (${baseline.n_samples}/10)`}
              </p>
            </div>
          </div>

          {/* Right side: stress pill + webcam pip + sign out */}
          <div className="flex items-center gap-4">

            {/* Live stress pill */}
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs"
              style={{
                borderColor:     fusionCfg.color + '40',
                backgroundColor: fusionCfg.color + '12',
              }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full animate-pulse-slow"
                style={{ backgroundColor: fusionCfg.color }}
              />
              <span style={{ color: fusionCfg.color }}>{fusionCfg.label}</span>
              <span className="text-[#4A4760]">{Math.round(fusion.score * 100)}%</span>
            </div>

            {/* Webcam pip — backend camera, polls /camera/frame every 2s */}
            <WebcamPip
              frameUrl={webcam.frameUrl}
              active={webcam.active}
              stressLevel={webcam.stressLevel}
              faceDetected={webcam.faceDetected}
              faceScore={webcam.faceScore}
              loading={webcam.loading}
              fps={0}
              onToggle={webcam.toggle}
            />

            {/* Sign out */}
            <button
              onClick={signOut}
              className="text-[11px] text-[#4A4760] hover:text-[#8B87A8] transition-colors px-2 py-1"
            >
              Sign out
            </button>
          </div>
        </header>

        {/* Alert banner */}
        {fusion.alert && fusion.alertReasons.length > 0 && (
          <div className="px-5 py-2.5 bg-red-900/20 border-b border-red-500/20 flex items-center gap-2 flex-shrink-0">
            <span className="text-red-400 text-xs">⚠</span>
            <p className="text-xs text-red-400">{fusion.alertReasons[0]}</p>
          </div>
        )}

        {/* Voice transcript banner */}
        {(voice.recording || voice.processing || voice.transcript) && (
          <div className="px-5 py-2.5 bg-[#1E2230] border-b border-[rgba(255,255,255,0.05)] flex items-center gap-3 flex-shrink-0">
            {voice.recording && (
              <>
                <div className="flex items-end gap-px h-4">
                  {[...Array(12)].map((_, i) => (
                    <div
                      key={i}
                      className="w-0.5 rounded-full bg-[#7C6FCD]"
                      style={{
                        height:         `${20 + Math.sin(Date.now() / 200 + i) * 60}%`,
                        animationDelay: `${i * 60}ms`,
                      }}
                    />
                  ))}
                </div>
                <span className="text-xs text-[#7C6FCD]">Recording {voice.seconds}s</span>
                <span className="text-[10px] text-[#4A4760]">Click mic to stop</span>
              </>
            )}
            {voice.processing && (
              <span className="text-xs text-[#8B87A8]">Processing audio...</span>
            )}
            {!voice.recording && !voice.processing && voice.transcript && (
              <span className="text-xs text-[#8B87A8] truncate">"{voice.transcript}"</span>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {/* Typing indicator */}
          {sending && (
            <div className="flex gap-3 items-end animate-fade-up">
              <div className="w-7 h-7 rounded-full bg-[#3D3669] border border-[#7C6FCD]/40 flex items-center justify-center flex-shrink-0">
                <span className="text-[11px] font-bold text-[#7C6FCD]">M</span>
              </div>
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-[#1E2230] border border-[rgba(255,255,255,0.06)]">
                <div className="flex gap-1 items-center h-4">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-[#4A4760]"
                      style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-[rgba(255,255,255,0.05)] bg-[#0D0F14]">
          <div className="flex items-end gap-3 p-3 rounded-2xl bg-[#151821] border border-[rgba(255,255,255,0.07)] focus-within:border-[rgba(255,255,255,0.12)] transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What's on your mind? (Enter to send, Shift+Enter for new line)"
              rows={1}
              className="flex-1 bg-transparent text-sm text-[#F0EEF9] placeholder-[#4A4760] focus:outline-none leading-relaxed resize-none"
              style={{ maxHeight: 120, overflowY: 'auto' }}
            />

            {/* Voice button */}
            <VoiceButton
              recording={voice.recording}
              processing={voice.processing}
              seconds={voice.seconds}
              onToggle={voice.toggle}
            />

            {/* Send button */}
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className="w-9 h-9 rounded-xl bg-[#7C6FCD] flex items-center justify-center hover:bg-[#6B5EBC] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            >
              {sending ? (
                <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white -rotate-90">
                  <line x1="12" y1="19" x2="12" y2="5"/>
                  <polyline points="5 12 12 5 19 12"/>
                </svg>
              )}
            </button>
          </div>

          {/* Bottom hint */}
          <div className="flex items-center justify-between mt-2 px-1">
            <p className="text-[10px] text-[#4A4760]">
              Keystrokes tracked · {webcam.active ? `Face active · ${webcam.stressLevel ?? 'detecting'}` : 'Face off'} · {sensor.connected ? `BPM ${sensor.bpm ? Math.round(sensor.bpm) : '…'}` : 'Sensor disconnected'}
            </p>
            {!sensor.connected && (
              <button
                onClick={() => sensorAPI.connect().catch(() => {})}
                className="text-[10px] text-[#7C6FCD] hover:underline"
              >
                Connect sensor
              </button>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40%            { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  )
}