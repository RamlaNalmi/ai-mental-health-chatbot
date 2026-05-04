import { useState, useEffect, useCallback } from 'react'
import { sensorAPI } from '../services/api'

export function useSensor() {
  const [connected, setConnected] = useState(false)
  const [bpm, setBpm] = useState(null)
  const [hrv, setHrv] = useState(null)
  const [spo2, setSpo2] = useState(null)
  const [gsr, setGsr] = useState(null)
  const [bpmHistory, setBpmHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [port, setPort] = useState('COM4')

  const connect = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await sensorAPI.connect()
      setConnected(true)
      setPort(result.port || 'COM4')
    } catch (err) {
      setError(err.message || 'Failed to connect sensor')
      setConnected(false)
    } finally {
      setLoading(false)
    }
  }, [])

  const disconnect = useCallback(async () => {
    try {
      await sensorAPI.disconnect()
      setConnected(false)
      setBpm(null)
      setSpo2(null)
      setGsr(null)
      setBpmHistory([])
    } catch (err) {
      setError(err.message || 'Failed to disconnect sensor')
    }
  }, [])

  useEffect(() => {
    if (!connected) return

    const poll = async () => {
      try {
        // getStatus() returns: { connected, latest_bpm, latest_spo2, latest_gsr, bpm_zone, ... }
        // getHistory() returns: { bpm_history: [...], full_history: [...], alerts: [...] }
        const [status, history] = await Promise.all([
          sensorAPI.getStatus(),
          sensorAPI.getHistory(60),
        ])

        // Keep connected state in sync with what the server reports
        setConnected(status.connected)
        setPort(status.port || 'COM4')

        // Latest readings from status endpoint
        setBpm(status.latest_bpm ?? null)
        setSpo2(status.latest_spo2 ?? null)
        setGsr(status.latest_gsr ?? null)
        // HRV not in your backend yet — leave null
        setHrv(null)

        // bpm_history is already a plain number array from your backend
        setBpmHistory(history.bpm_history ?? [])

      } catch (err) {
        console.error('Failed to fetch sensor data:', err)
      }
    }

    poll() // immediate first fetch
    const interval = setInterval(poll, 10000)
    return () => clearInterval(interval)
  }, [connected])

  return {
    connected,
    bpm,
    hrv,
    spo2,
    gsr,
    bpmHistory,
    loading,
    error,
    port,
    connect,
    disconnect,
  }
}