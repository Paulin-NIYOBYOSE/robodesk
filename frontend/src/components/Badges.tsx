import { Loader2 } from 'lucide-react'
import { STATUS_LABEL, QUALITY_LABEL } from '../lib/labels'
import type { Assignment, Quality, RequestStatus } from '../types/api'
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

/** Background export state of one assigned episode. */
export function ExportBadge({ assignment }: { assignment: Assignment }) {
  const { export_status: status, export_attempts: attempts, export_error: error } = assignment
  if (status === 'succeeded') return <Badge tone="green">Exported</Badge>
  if (status === 'running') {
    return (
      <Badge tone="blue">
        <Loader2 className="size-3 animate-spin" aria-hidden /> Exporting
      </Badge>
    )
  }
  if (status === 'failed') {
    return (
      <span title={error ?? undefined}>
        <Badge tone="red">Failed after {attempts} tries</Badge>
      </span>
    )
  }
  return (
    <span title={error ?? undefined}>
      <Badge>{attempts > 0 ? `Retrying (attempt ${attempts + 1})` : 'Queued'}</Badge>
    </span>
  )
}
