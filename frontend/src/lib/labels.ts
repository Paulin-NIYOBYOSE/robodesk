import type { Quality, RequestStatus, Role } from '../types/api'

export const STATUS_LABEL: Record<RequestStatus, string> = {
  submitted: 'Submitted',
  in_progress: 'In progress',
  delivered: 'Delivered',
  accepted: 'Accepted',
  rejected: 'Rejected',
}

export const STATUS_DESCRIPTION: Record<RequestStatus, string> = {
  submitted: 'Waiting for an operator to pick it up',
  in_progress: 'Operators are assigning episodes',
  delivered: 'Waiting for the client to review',
  accepted: 'Delivery accepted by the client',
  rejected: 'Client rejected the delivery — rework needed',
}

export const QUALITY_LABEL: Record<Quality, string> = { good: 'Good', usable: 'Usable', bad: 'Bad' }

export const ROLE_LABEL: Record<Role, string> = { client: 'Client', operator: 'Operator', admin: 'Admin' }

/** Button label for an operator moving a request to `target` from `current`. */
export function transitionLabel(current: RequestStatus, target: RequestStatus): string {
  if (target === 'in_progress') return current === 'rejected' ? 'Start rework' : 'Start work'
  if (target === 'delivered') return 'Mark as delivered'
  if (target === 'accepted') return 'Accept delivery'
  if (target === 'rejected') return 'Reject delivery'
  return STATUS_LABEL[target]
}
