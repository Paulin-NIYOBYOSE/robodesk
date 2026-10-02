import { ArrowRight, Inbox, Plus } from 'lucide-react'
import { Link } from 'react-router'
import { StatusBadge } from '../components/Badges'
import { buttonStyles } from '../components/ui/buttonStyles'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { Progress } from '../components/ui/Progress'
import { EmptyState, ErrorState, Skeleton, TableSkeleton } from '../components/ui/States'
import { useRequests, useRequestSummary, type RequestListFilters } from '../hooks/requests'
import { isStaff, useCurrentUser } from '../lib/auth'
import { cn, formatDate, formatNumber, isOverdue } from '../lib/format'
import type { RequestSummary } from '../types/api'

interface Tile {
  label: string
  value: number
  to: string
  emphasis?: boolean
}

function SummaryTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className={cn('mb-6 grid gap-4 sm:grid-cols-2', tiles.length > 4 ? 'lg:grid-cols-5' : 'lg:grid-cols-3')}>
      {tiles.map((tile) => (
        <Link
          key={tile.label}
          to={tile.to}
          className="group rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-xs transition-colors hover:border-zinc-300"
        >
          <p className="text-[13px] text-zinc-500">{tile.label}</p>
          <p
            className={cn(
              'mt-1 text-2xl font-semibold tracking-tight text-zinc-900',
              tile.emphasis && tile.value > 0 && 'text-red-600',
            )}
          >
            {formatNumber(tile.value)}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-400 group-hover:text-brand-600">
            View <ArrowRight className="size-3" aria-hidden />
          </p>
        </Link>
      ))}
    </div>
  )
}

function staffTiles(summary: RequestSummary): Tile[] {
  return [
    { label: 'Waiting to start', value: summary.by_status.submitted, to: '/requests?status=submitted&sort=deadline' },
    { label: 'In progress', value: summary.by_status.in_progress, to: '/requests?status=in_progress&sort=deadline' },
    { label: 'Awaiting client review', value: summary.by_status.delivered, to: '/requests?status=delivered' },
    { label: 'Rework requested', value: summary.by_status.rejected, to: '/requests?status=rejected&sort=deadline' },
    { label: 'Overdue', value: summary.overdue, to: '/requests?sort=deadline', emphasis: true },
  ]
}

function clientTiles(summary: RequestSummary): Tile[] {
  const { submitted, in_progress, rejected, delivered, accepted } = summary.by_status
  return [
    { label: 'In the works', value: submitted + in_progress + rejected, to: '/requests' },
    { label: 'Awaiting your review', value: delivered, to: '/requests?status=delivered' },
    { label: 'Accepted', value: accepted, to: '/requests?status=accepted' },
  ]
}

function RequestShortList({
  title,
  description,
  filters,
  showClient,
  emptyText,
}: {
  title: string
  description?: string
  filters: RequestListFilters
  showClient: boolean
  emptyText: string
}) {
  const requests = useRequests({ page_size: 5, ...filters })
  return (
    <Card>
      <CardHeader title={title} description={description} />
      {requests.isPending ? (
        <TableSkeleton rows={3} />
      ) : requests.isError ? (
        <ErrorState message={requests.error.message} onRetry={() => requests.refetch()} />
      ) : requests.data.items.length === 0 ? (
        <EmptyState icon={Inbox} title={emptyText} />
      ) : (
        <ul className="divide-y divide-zinc-100">
          {requests.data.items.map((request) => {
            const overdue = isOverdue(request.deadline, request.status)
            return (
              <li key={request.id}>
                <Link
                  to={`/requests/${request.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 transition-colors hover:bg-zinc-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900">{request.task_name}</p>
                    <p className="text-xs text-zinc-500">
                      #{request.id}
                      {showClient && ` · ${request.client.organisation ?? request.client.name}`} · due{' '}
                      <span className={cn(overdue && 'font-medium text-red-600')}>{formatDate(request.deadline)}</span>
                    </p>
                  </div>
                  <div className="w-28">
                    <p className="tabular mb-1 text-right text-xs text-zinc-500">
                      {request.assigned_count} / {request.episodes_requested}
                    </p>
                    <Progress value={request.assigned_count} max={request.episodes_requested} />
                  </div>
                  <StatusBadge status={request.status} />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

export function DashboardPage() {
  const user = useCurrentUser()
  const staff = isStaff(user)
  const summary = useRequestSummary()

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.name.split(' ')[0]}`}
        description={
          staff ? 'What needs the operations team’s attention today.' : `Dataset requests for ${user.organisation ?? user.name}.`
        }
        actions={
          user.role === 'client' && (
            <Link to="/requests/new" className={buttonStyles()}>
              <Plus className="size-4" aria-hidden /> New request
            </Link>
          )
        }
      />

      {summary.isPending ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-24" />
          ))}
        </div>
      ) : summary.isError ? (
        <Card className="mb-6">
          <ErrorState message={summary.error.message} onRetry={() => summary.refetch()} />
        </Card>
      ) : (
        <SummaryTiles tiles={staff ? staffTiles(summary.data) : clientTiles(summary.data)} />
      )}

      {staff ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <RequestShortList
            title="Waiting to start"
            description="Submitted requests, nearest deadline first"
            filters={{ status: 'submitted', sort: 'deadline' }}
            showClient
            emptyText="Nothing waiting — all caught up"
          />
          <RequestShortList
            title="In progress"
            description="Nearest deadline first"
            filters={{ status: 'in_progress', sort: 'deadline' }}
            showClient
            emptyText="No requests in progress"
          />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <RequestShortList
            title="Awaiting your review"
            description="Delivered datasets to accept or reject"
            filters={{ status: 'delivered' }}
            showClient={false}
            emptyText="No deliveries waiting for you"
          />
          <RequestShortList
            title="Recent requests"
            filters={{ sort: 'newest' }}
            showClient={false}
            emptyText="You haven't submitted any requests yet"
          />
        </div>
      )}
    </>
  )
}
