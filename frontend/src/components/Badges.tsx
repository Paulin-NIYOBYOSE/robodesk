import { STATUS_LABEL, QUALITY_LABEL } from '../lib/labels'
import type { Quality, RequestStatus } from '../types/api'
import { Badge, type Tone } from './ui/Badge'

const STATUS_TONE: Record<RequestStatus, Tone> = {
  submitted: 'neutral',
  in_progress: 'blue',
  delivered: 'violet',
  accepted: 'green',
  rejected: 'red',
}

const QUALITY_TONE: Record<Quality, Tone> = { good: 'green', usable: 'amber', bad: 'red' }

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} dot>
      {STATUS_LABEL[status]}
    </Badge>
  )
}

export function QualityBadge({ quality }: { quality: Quality }) {
  return <Badge tone={QUALITY_TONE[quality]}>{QUALITY_LABEL[quality]}</Badge>
}
