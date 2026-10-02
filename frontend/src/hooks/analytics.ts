import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Analytics } from '../types/api'

export function useAnalytics(from: string, to: string) {
  return useQuery({
    queryKey: ['analytics', from, to],
    queryFn: ({ signal }) => api<Analytics>('/analytics', { query: { from, to }, signal }),
    enabled: Boolean(from && to) && from <= to,
    // Hold the previous charts while a new range loads (no skeleton flash).
    placeholderData: keepPreviousData,
  })
}
