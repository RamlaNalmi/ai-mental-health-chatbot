import useSWR from 'swr'
import { chatAPI } from '../services/api'

const fetcher = () => chatAPI.getFusionStatus().catch(() => null)

export function useFusion() {
  const { data } = useSWR('fusion-status', fetcher, {
    refreshInterval: 5000,
    revalidateOnFocus: false,
  })

  return {
    score:        data?.fused_score    ?? 0,
    label:        data?.fused_label    ?? 'no_stress',
    confidence:   data?.confidence     ?? 0,
    alert:        data?.alert          ?? false,
    alertReasons: data?.alert_reasons  ?? [],
    dashboard:    data?.dashboard      ?? null,
    signals:      data?.signals        ?? {},
    signalsUsed:  data?.signals_used   ?? 0,
  }
}