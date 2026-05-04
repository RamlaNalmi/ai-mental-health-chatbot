import { useState, useEffect, useRef, useCallback } from 'react'
import { cameraAPI } from '../services/api'

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000'

export function useWebcam({ onStressDetected } = {}) {
  const [active,       setActive]       = useState(false)
  const [streamUrl,    setStreamUrl]    = useState(null)
  const [stressLevel,  setStressLevel]  = useState('no_stress')
  const [faceDetected, setFaceDetected] = useState(false)
  const [faceScore,    setFaceScore]    = useState(0.0)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState(null)

  const stressIntervalRef = useRef(null)
  const activeRef         = useRef(false)

  // ── Stress poll — every 40s, completely separate from video ──
  const pollStress = useCallback(async () => {
    if (!activeRef.current) return
    try {
      const data  = await cameraAPI.getStatus()
      const level = data.stress_level ?? 'no_stress'
      setStressLevel(level)
      setFaceDetected(data.face_detected ?? false)
      setFaceScore(data.face_score ?? 0.0)
      if (level === 'high') onStressDetected?.(data)
    } catch (_) {}
  }, [onStressDetected])

  // ── Start ────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (activeRef.current) return
    setLoading(true)
    setError(null)
    try {
      await cameraAPI.start()
      activeRef.current = true
      setActive(true)

      // Stream URL — browser handles this natively, buttery smooth
      // Token in query param so the img tag can authenticate
      const token = localStorage.getItem('access_token')
      setStreamUrl(`${BASE_URL}/camera/stream?token=${token}`)

      // Stress updates every 40s
      stressIntervalRef.current = setInterval(pollStress, 40000)
      pollStress()   // immediate first read
    } catch (err) {
      console.error('[useWebcam] start failed:', err)
      setError('Failed to start camera')
    } finally {
      setLoading(false)
    }
  }, [pollStress])

  // ── Stop ─────────────────────────────────────────────────────
  const stop = useCallback(async () => {
    activeRef.current = false
    setActive(false)
    setStreamUrl(null)

    clearInterval(stressIntervalRef.current)
    stressIntervalRef.current = null

    try { await cameraAPI.stop() } catch (_) {}
  }, [])

  const toggle = useCallback(() => {
    activeRef.current ? stop() : start()
  }, [start, stop])

  useEffect(() => {
    return () => {
      activeRef.current = false
      clearInterval(stressIntervalRef.current)
    }
  }, [])

  return {
    active,
    streamUrl,      // ← use this in <img src={streamUrl} />
    stressLevel,
    faceDetected,
    faceScore,
    loading,
    error,
    toggle,
    start,
    stop,
  }
}