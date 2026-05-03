import { useRef, useCallback } from 'react'
 
export function useKeystrokes() {
  const keystrokes = useRef([])
  const startTime  = useRef(null)
 
  const onKeyDown = useCallback((e) => {
    const now = Date.now()
    if (!startTime.current) startTime.current = now
    keystrokes.current.push({ key: e.key, ts_ms: now, type: 'down' })
  }, [])
 
  const flush = useCallback(() => {
    const ks = [...keystrokes.current]
    keystrokes.current = []
    startTime.current  = null
    return ks
  }, [])
 
  return { onKeyDown, flush, count: () => keystrokes.current.length }
}