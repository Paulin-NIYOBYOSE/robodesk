// Mirrors the API's Pydantic schemas (see backend/app/schemas).

export type Role = 'client' | 'operator' | 'admin'
export type RequestStatus = 'submitted' | 'in_progress' | 'delivered' | 'accepted' | 'rejected'
export type Quality = 'good' | 'usable' | 'bad'

export const REQUEST_STATUSES: RequestStatus[] = ['submitted', 'in_progress', 'delivered', 'accepted', 'rejected']
export const QUALITIES: Quality[] = ['good', 'usable', 'bad']
export const ROLES: Role[] = ['client', 'operator', 'admin']

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface UserSummary {
  id: number
  name: string
  role: Role
  organisation: string | null
}

export interface User extends UserSummary {
  email: string
  is_active: boolean
  created_at: string
}

export interface TokenResponse {
  access_token: string
  token_type: 'bearer'
  expires_in: number
  user: User
}

export interface StatusHistoryEntry {
  previous_status: RequestStatus | null
  new_status: RequestStatus
  changed_by: UserSummary
  changed_at: string
  comment: string | null
}

export interface DatasetRequest {
  id: number
  task_name: string
  episodes_requested: number
  assigned_count: number
  deadline: string
  notes: string | null
  status: RequestStatus
  client: UserSummary
  created_at: string
  updated_at: string
}

export interface RequestDetail extends DatasetRequest {
  history: StatusHistoryEntry[]
  allowed_transitions: RequestStatus[]
}

export interface RequestSummary {
  by_status: Record<RequestStatus, number>
  total: number
  overdue: number
}

export interface Episode {
  id: number
  episode_id: string
  robot_id: string
  task_name: string
  recorded_at: string
  duration_seconds: number
  operator_name: string
  quality: Quality
  assigned_request_id: number | null
}

export interface EpisodeFacets {
  robots: string[]
  task_names: string[]
}

export interface Assignment {
  id: number
  episode: Episode
  assigned_at: string
  assigned_by: UserSummary
}

export interface AssignResult {
  assigned: number
  assigned_count: number
  episodes_requested: number
}

export interface ImportReport {
  processed: number
  imported: number
  skipped_duplicates: number
  rejected: number
  normalized: number
  blank_lines: number
  reasons: { code: string; label: string; count: number }[]
  issues: { line: number; episode_id: string | null; code: string; message: string }[]
  issues_truncated: boolean
}

export interface Analytics {
  from: string
  to: string
  episodes_per_day_by_robot: { date: string; robot_id: string; count: number }[]
  request_fulfilment: {
    counts_by_status: Record<RequestStatus, number>
    total: number
    median_seconds_to_delivery: number | null
    delivered_requests: number
  }
  top_tasks_by_good_episodes: { task_name: string; good_episodes: number }[]
}
