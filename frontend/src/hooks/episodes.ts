import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Episode, EpisodeFacets, ImportReport, Page, Quality } from '../types/api'

export interface EpisodeFilters {
  task_name?: string
  quality?: Quality | ''
  robot_id?: string
  available?: boolean
  search?: string
  page?: number
  page_size?: number
}

export function useEpisodes(filters: EpisodeFilters, enabled = true) {
  return useQuery({
    queryKey: ['episodes', 'list', filters],
    queryFn: ({ signal }) => api<Page<Episode>>('/episodes', { query: { ...filters }, signal }),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useEpisodeFacets() {
  return useQuery({
    queryKey: ['episodes', 'facets'],
    queryFn: ({ signal }) => api<EpisodeFacets>('/episodes/facets', { signal }),
    staleTime: 5 * 60_000,
  })
}

export function useImportEpisodes() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return api<ImportReport>('/episodes/import', { method: 'POST', body: form })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['episodes'] }),
  })
}
