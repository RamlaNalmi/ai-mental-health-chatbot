import { useState, useEffect, useCallback } from 'react'
import { sensorAPI } from '../services/api'

export function useSensor() {
  const [connected, setConnected] = useState(false)
  const [bpm, setBpm] = useState(null)
  const [hrv, setHrv] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const connect = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await sensorAPI.connect()
      setConnected(true)
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
      setHrv(null)
    } catch (err) {
      setError(err.message || 'Failed to disconnect sensor')
    }
  }, [])

  // Poll sensor data when connected
  useEffect(() => {
    let interval
    if (connected) {
      interval = setInterval(async () => {
        try {
          const data = await sensorAPI.getHistory(1)
          if (data && data.length > 0) {
            const latest = data[0]
            setBpm(latest.bpm)
            setHrv(latest.hrv)
          }
        } catch (err) {
          console.error('Failed to fetch sensor data:', err)
        }
      }, 1000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [connected])

  return {
    connected,
    bpm,
    hrv,
    loading,
    error,
    connect,
    disconnect
  }
}
