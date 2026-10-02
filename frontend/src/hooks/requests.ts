import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type {
  Assignment,
  AssignResult,
  DatasetRequest,
  Page,
  RequestDetail,
  RequestStatus,
  RequestSummary,
  UserSummary,
} from '../types/api'

export interface RequestListFilters {
  status?: RequestStatus | ''
  task_name?: string
  client_id?: string
  deadline_before?: string
  sort?: 'newest' | 'deadline'
  page?: number
  page_size?: number
}

export interface NewRequest {
  task_name: string
  episodes_requested: number
  deadline: string
  notes: string | null
}

export function useRequests(filters: RequestListFilters) {
  return useQuery({
    queryKey: ['requests', 'list', filters],
    queryFn: ({ signal }) => api<Page<DatasetRequest>>('/requests', { query: { ...filters }, signal }),
    placeholderData: keepPreviousData, // keep the table on screen while the next page loads
  })
}

export function useRequestSummary() {
  return useQuery({
    queryKey: ['requests', 'summary'],
    queryFn: ({ signal }) => api<RequestSummary>('/requests/summary', { signal }),
  })
}

export function useRequest(id: number) {
  return useQuery({
    queryKey: ['requests', 'detail', id],
    queryFn: ({ signal }) => api<RequestDetail>(`/requests/${id}`, { signal }),
  })
}

export function useAssignments(id: number, page: number, pageSize = 10) {
  return useQuery({
    queryKey: ['requests', 'assignments', id, page, pageSize],
    queryFn: ({ signal }) =>
      api<Page<Assignment>>(`/requests/${id}/assignments`, { query: { page, page_size: pageSize }, signal }),
    placeholderData: keepPreviousData,
    // Poll while background exports on this page are still in flight.
    refetchInterval: (query) =>
      query.state.data?.items.some((a) => a.export_status === 'pending' || a.export_status === 'running')
        ? 2000
        : false,
  })
}

export function useClients(enabled: boolean) {
  return useQuery({
    queryKey: ['clients'],
    queryFn: ({ signal }) => api<UserSummary[]>('/clients', { signal }),
    enabled,
    staleTime: 5 * 60_000,
  })
}

/** After any change to a request, refresh every request view (lists, detail, summary). */
function useInvalidateRequests() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['requests'] })
}

export function useCreateRequest() {
  const invalidate = useInvalidateRequests()
  return useMutation({
    mutationFn: (body: NewRequest) => api<RequestDetail>('/requests', { method: 'POST', body }),
    onSuccess: invalidate,
  })
}

export function useTransitionRequest(id: number) {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateRequests()
  return useMutation({
    mutationFn: ({ to, comment }: { to: RequestStatus; comment?: string }) => {
      if (to === 'accepted') return api<RequestDetail>(`/requests/${id}/accept`, { method: 'POST' })
      if (to === 'rejected') {
        return api<RequestDetail>(`/requests/${id}/reject`, { method: 'POST', body: { reason: comment ?? '' } })
      }
      return api<RequestDetail>(`/requests/${id}/transition`, { method: 'POST', body: { to_status: to, comment } })
    },
    onSuccess: (detail) => {
      queryClient.setQueryData(['requests', 'detail', id], detail)
      return invalidate()
    },
  })
}

function useInvalidateAssignments() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['requests'] }),
      queryClient.invalidateQueries({ queryKey: ['episodes'] }),
    ])
}

export function useAssignEpisodes(id: number) {
  const invalidate = useInvalidateAssignments()
  return useMutation({
    mutationFn: (episodeIds: number[]) =>
      api<AssignResult>(`/requests/${id}/assignments`, { method: 'POST', body: { episode_ids: episodeIds } }),
    onSettled: invalidate, // also on conflict: someone else may have taken an episode
  })
}

export function useRetryExport(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (episodeId: number) =>
      api<void>(`/requests/${id}/assignments/${episodeId}/retry-export`, { method: 'POST' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['requests', 'assignments', id] }),
  })
}

export function useUnassignEpisode(id: number) {
  const invalidate = useInvalidateAssignments()
  return useMutation({
    mutationFn: (episodeId: number) => api<void>(`/requests/${id}/assignments/${episodeId}`, { method: 'DELETE' }),
    onSettled: invalidate,
  })
}
