import { useState, useRef, useCallback } from 'react'
import { audioAPI } from '../services/api'

export function useVoice({ onResult } = {}) {
  const [recording,   setRecording]   = useState(false)
  const [processing,  setProcessing]  = useState(false)
  const [transcript,  setTranscript]  = useState('')
  const [seconds,     setSeconds]     = useState(0)

  const mediaRecorderRef = useRef(null)
  const audioChunksRef   = useRef([])
  const timerRef         = useRef(null)

  const startRecording = useCallback(async () => {
    try {
      const stream        = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)

      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current   = []

      mediaRecorder.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        setProcessing(true)
        try {
          const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm'
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
          
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
          console.log('[VOICE] 🎙️ Recording stopped')
          console.log('[VOICE] mimeType:', mimeType)
          console.log('[VOICE] Blob size:', audioBlob.size, 'bytes')
          console.log('[VOICE] Chunks:', audioChunksRef.current.length)
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

          console.log('[VOICE] 📤 Uploading to /upload-audio...')
          const audioResult = await audioAPI.upload(audioBlob, mimeType)

          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
          console.log('[VOICE] ✅ Upload result:')
          console.log('[VOICE]   success:     ', audioResult.success)
          console.log('[VOICE]   transcript:  ', audioResult.transcript)
          console.log('[VOICE]   voice_score: ', audioResult.voice_score)
          console.log('[VOICE]   error:       ', audioResult.error)
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

          setTranscript(audioResult.transcript || '')

          const resultPayload = {
            transcript:  audioResult.transcript || '',
            voice_score: audioResult.voice_score ?? null,
            success:     audioResult.success,
            error:       audioResult.error,
          }
          console.log('[VOICE] 📨 Calling onResult with:', resultPayload)
          onResult?.(resultPayload)

        } catch (err) {
          console.error('[VOICE] ❌ Upload failed:', err)
          onResult?.({ transcript: '', voice_score: null, success: false, error: err.message })
        } finally {
          setProcessing(false)
          setRecording(false)
          stream.getTracks().forEach(t => t.stop())
        }
      }

      mediaRecorder.start()
      setRecording(true)
      setSeconds(0)

      timerRef.current = setInterval(() => setSeconds(p => p + 1), 1000)
    } catch (err) {
      console.error('[useVoice] Failed to start recording:', err)
    }
  }, [onResult])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop()
      clearInterval(timerRef.current)
    }
  }, [recording])

  const toggle = useCallback(() => {
    if (recording) stopRecording()
    else startRecording()
  }, [recording, startRecording, stopRecording])

  return { recording, processing, transcript, seconds, toggle, startRecording, stopRecording }
}