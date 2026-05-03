import { useState, useRef, useCallback } from 'react'

export function useVoice({ onResult } = {}) {
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [seconds, setSeconds] = useState(0)
  
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const timerRef = useRef(null)

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []
      
      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data)
      }
      
      mediaRecorder.onstop = async () => {
        setProcessing(true)
        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
          // Here you would send to your voice API
          // const result = await voiceAPI.transcribe(audioBlob)
          
          // Mock result for now
          const mockResult = {
            success: true,
            transcript: "This is a mock transcript",
            final_label: Math.random() > 0.5 ? 1 : 0
          }
          
          setTranscript(mockResult.transcript)
          onResult?.(mockResult)
        } catch (error) {
          console.error('Voice processing failed:', error)
        } finally {
          setProcessing(false)
          setRecording(false)
        }
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop())
      }
      
      mediaRecorder.start()
      setRecording(true)
      setSeconds(0)
      
      // Start timer
      timerRef.current = setInterval(() => {
        setSeconds(prev => prev + 1)
      }, 1000)
      
    } catch (error) {
      console.error('Failed to start recording:', error)
    }
  }, [onResult])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop()
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [recording])

  const toggle = useCallback(() => {
    if (recording) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [recording, startRecording, stopRecording])

  return {
    recording,
    processing,
    transcript,
    seconds,
    toggle,
    startRecording,
    stopRecording
  }
}
