import { useState, useRef, useCallback, useEffect } from 'react'
import { cameraAPI } from '../services/api'

const POLL_INTERVAL_MS = 500  // poll backend every 500ms (2fps) - reduced for memory

export function useWebcam({ onStressDetected } = {}) {
  const [active,       setActive]       = useState(false)
  const [stressLevel,  setStressLevel]  = useState('no_stress')
  const [faceDetected, setFaceDetected] = useState(false)
  const [faceScore,    setFaceScore]    = useState(0)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState(null)
  const [frameUrl,     setFrameUrl]     = useState(null)

  const intervalRef = useRef(null)
  const activeRef   = useRef(false)

  const pollCamera = useCallback(async () => {
    if (!activeRef.current) return

    try {
      const data = await cameraAPI.getFrame()       // GET /camera/frame
      if (data.frame_b64) {
        // Clear previous frame to free memory
        setFrameUrl(null)
        // Small delay to allow garbage collection
        setTimeout(() => {
          if (activeRef.current) {
            setFrameUrl(`data:image/jpeg;base64,${data.frame_b64}`)
          }
        }, 10)
      }
      const det = data.detections || {}
      setStressLevel(det.stress_level  ?? 'no_stress')
      setFaceDetected(det.face_detected ?? false)
      setFaceScore(det.face_score      ?? 0)

      if (det.stress_level === 'high' && onStressDetected) {
        onStressDetected(det)
      }
    } catch {
      // silently drop — frame might not be ready yet
    }
  }, [onStressDetected])

  const startWebcam = useCallback(async () => {
    if (activeRef.current) return
    setLoading(true)
    setError(null)
    setFrameUrl(null)

    try {
      // Start camera on backend
      await cameraAPI.start()
      
      activeRef.current  = true
      setActive(true)

      // Start polling for frames
      intervalRef.current = setInterval(pollCamera, POLL_INTERVAL_MS)
      
      // Initial poll immediately
      pollCamera()

    } catch (e) {
      setError(e.response?.data?.detail || 'Could not start camera')
      console.error('[useWebcam] start error:', e)
    } finally {
      setLoading(false)
    }
  }, [pollCamera])

  const stopWebcam = useCallback(async () => {
    activeRef.current = false
    setActive(false)
    clearInterval(intervalRef.current)
    intervalRef.current = null
    
    // Clear frame URL to free memory
    setFrameUrl(null)
    setFaceDetected(false)
    setFaceScore(0)
    setStressLevel('no_stress')
    
    try {
      await cameraAPI.stop()                // POST /camera/stop
    } catch { /* ignore */ }
  }, [])

  const toggle = useCallback(() => {
    active ? stopWebcam() : startWebcam()
  }, [active, startWebcam, stopWebcam])

  // Stop on unmount - proper cleanup to prevent memory leaks
  useEffect(() => () => {
    activeRef.current = false
    clearInterval(intervalRef.current)
    intervalRef.current = null
    setFrameUrl(null)  // Clear frame URL to free memory
    cameraAPI.stop().catch(() => {})
  }, [])

  return {
    active,
    stressLevel,
    faceDetected,
    faceScore,
    loading,
    error,
    frameUrl,    // base64 data URL for <img> element
    toggle,
    startWebcam,
    stopWebcam,
  }
}