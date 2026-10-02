import { ArrowLeft, FileQuestion } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { StatusBadge } from '../components/Badges'
import { buttonStyles } from '../components/ui/buttonStyles'
import { Card, CardHeader } from '../components/ui/Card'
import { Progress } from '../components/ui/Progress'
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States'
import { useRequest } from '../hooks/requests'
import { ApiError } from '../lib/api'
import { isStaff, useCurrentUser } from '../lib/auth'
import { cn, formatDate, formatDateTime, formatNumber, isOverdue } from '../lib/format'
import { STATUS_DESCRIPTION } from '../lib/labels'
import { AssignedEpisodes } from './request-detail/AssignedEpisodes'
import { EpisodePicker } from './request-detail/EpisodePicker'
import { RequestActions } from './request-detail/RequestActions'
import { StatusTimeline } from './request-detail/StatusTimeline'

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{children}</dd>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading request">
      <Skeleton className="h-8 w-72" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  )
}

export function RequestDetailPage() {
  const requestId = Number(useParams().requestId)
  const user = useCurrentUser()
  const staff = isStaff(user)
  const query = useRequest(requestId)

  if (query.isPending) return <DetailSkeleton />
  if (query.isError) {
    // The API answers 404 both for missing requests and for other clients' requests.
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <EmptyState
          icon={FileQuestion}
          title="Request not found"
          description="It may not exist, or you may not have access to it."
          action={
            <Link to="/requests" className={buttonStyles('secondary')}>
              Back to requests
            </Link>
          }
        />
      )
    }
    return <ErrorState message={query.error.message} onRetry={() => query.refetch()} />
  }

  const request = query.data
  const editable = staff && request.status === 'in_progress'
  const overdue = isOverdue(request.deadline, request.status)
  const remaining = request.episodes_requested - request.assigned_count

  return (
    <>
      <Link to="/requests" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="size-4" aria-hidden /> Requests
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">{request.task_name}</h1>
            <StatusBadge status={request.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Request #{request.id} · {request.client.organisation ?? request.client.name} · submitted{' '}
            {formatDate(request.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RequestActions request={request} />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          <Card className="p-5">
            <Progress value={request.assigned_count} max={request.episodes_requested} showLabel />
            <p className="mt-3 text-[13px] text-slate-500">
              {STATUS_DESCRIPTION[request.status]}
              {request.status === 'in_progress' && remaining > 0 && staff && (
                <> · assign {formatNumber(remaining)} more before delivering.</>
              )}
            </p>
          </Card>
          <AssignedEpisodes request={request} editable={editable} staff={staff} />
          {editable && <EpisodePicker request={request} />}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-slate-100 px-5">
              <Detail label="Client">{request.client.organisation ?? request.client.name}</Detail>
              <Detail label="Episodes requested">{formatNumber(request.episodes_requested)}</Detail>
              <Detail label="Deadline">
                <span className={cn(overdue && 'text-red-600')}>
                  {formatDate(request.deadline)}
                  {overdue && ' · overdue'}
                </span>
              </Detail>
              <Detail label="Last updated">{formatDateTime(request.updated_at)}</Detail>
            </dl>
            <div className="border-t border-slate-100 px-5 py-4">
              <h3 className="text-xs font-medium text-slate-500">Notes</h3>
              <p className="mt-1 text-sm whitespace-pre-line text-slate-800">
                {request.notes ?? <span className="text-slate-400">No notes</span>}
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Status history" />
            <StatusTimeline history={request.history} />
          </Card>
        </div>
      </div>
    </>
  )
}
