import {
  AlarmClock,
  ArrowRight,
  CircleCheck,
  ClipboardList,
  History,
  Activity,
  Inbox,
  Plus,
  RotateCcw,
  Send,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { StatusBadge } from '../components/Badges'
import { buttonStyles } from '../components/ui/buttonStyles'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { ProgressRing } from '../components/ui/ProgressRing'
import { EmptyState, ErrorState, Skeleton, TableSkeleton } from '../components/ui/States'
import { useActivity, useRequests, useRequestSummary, type RequestListFilters } from '../hooks/requests'
import { isStaff, useCurrentUser } from '../lib/auth'
import { cn, formatDate, formatNumber, formatRelative, isOverdue } from '../lib/format'
import { STATUS_LABEL } from '../lib/labels'
import { REQUEST_STATUSES, type RequestStatus, type RequestSummary, type User } from '../types/api'

// Same hues as the status badges, so a status keeps its colour everywhere.
const STATUS_FILL: Record<RequestStatus, string> = {
  submitted: 'bg-slate-400',
  in_progress: 'bg-blue-500',
  delivered: 'bg-violet-500',
  accepted: 'bg-emerald-500',
  rejected: 'bg-red-500',
}

interface Tile {
  label: string
  value: number
  to: string
  icon: LucideIcon
  tint: string
  /** Text colour for the value when it is non-zero and needs attention. */
  emphasis?: string
}

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function staffTiles(summary: RequestSummary): Tile[] {
  const { by_status: s } = summary
  return [
    { label: 'Waiting to start', value: s.submitted, to: '/requests?status=submitted&sort=deadline', icon: Inbox, tint: 'bg-slate-100 text-slate-600' },
    { label: 'In progress', value: s.in_progress, to: '/requests?status=in_progress&sort=deadline', icon: Activity, tint: 'bg-blue-50 text-blue-600' },
    { label: 'Awaiting client', value: s.delivered, to: '/requests?status=delivered', icon: Send, tint: 'bg-violet-50 text-violet-600' },
    { label: 'Rework requested', value: s.rejected, to: '/requests?status=rejected&sort=deadline', icon: RotateCcw, tint: 'bg-red-50 text-red-600' },
    { label: 'Overdue', value: summary.overdue, to: '/requests?sort=deadline', icon: AlarmClock, tint: 'bg-amber-50 text-amber-600', emphasis: 'text-red-600' },
  ]
}

function clientTiles(summary: RequestSummary): Tile[] {
  const { submitted, in_progress, rejected, delivered, accepted } = summary.by_status
  return [
    { label: 'In the works', value: submitted + in_progress + rejected, to: '/requests', icon: Activity, tint: 'bg-blue-50 text-blue-600' },
    { label: 'Awaiting your review', value: delivered, to: '/requests?status=delivered', icon: Inbox, tint: 'bg-violet-50 text-violet-600', emphasis: 'text-brand-600' },
    { label: 'Accepted', value: accepted, to: '/requests?status=accepted', icon: CircleCheck, tint: 'bg-emerald-50 text-emerald-600' },
  ]
}

function StatTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2', tiles.length > 4 ? 'xl:grid-cols-5' : 'lg:grid-cols-3')}>
      {tiles.map(({ label, value, to, icon: Icon, tint, emphasis }) => (
        <Link
          key={label}
          to={to}
          className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lift"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] font-medium text-slate-500">{label}</p>
            <span className={cn('flex size-9 items-center justify-center rounded-xl', tint)}>
              <Icon className="size-[18px]" aria-hidden />
            </span>
          </div>
          <p className={cn('mt-2 text-3xl font-semibold tracking-tight', emphasis && value > 0 ? emphasis : 'text-slate-900')}>
            {formatNumber(value)}
          </p>
          <p className="mt-1 flex items-center gap-1 text-xs text-slate-400 transition-colors group-hover:text-brand-600">
            View requests <ArrowRight className="size-3" aria-hidden />
          </p>
        </Link>
      ))}
    </div>
  )
}

/** Part-to-whole bar of requests by status, with a legend that carries the numbers. */
function Pipeline({ summary }: { summary: RequestSummary }) {
  const total = summary.total
  return (
    <Card>
      <CardHeader
        icon={ClipboardList}
        title="Request pipeline"
        description={`${formatNumber(total)} request${total === 1 ? '' : 's'} by current status`}
      />
      <div className="px-5 py-5">
        {total === 0 ? (
          <p className="text-sm text-slate-500">No requests yet.</p>
        ) : (
          <>
            <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
              {REQUEST_STATUSES.filter((status) => summary.by_status[status] > 0).map((status) => (
                <div
                  key={status}
                  className={cn('h-full transition-all duration-700', STATUS_FILL[status])}
                  style={{ width: `${(summary.by_status[status] / total) * 100}%` }}
                  title={`${STATUS_LABEL[status]}: ${summary.by_status[status]}`}
                />
              ))}
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
              {REQUEST_STATUSES.map((status) => (
                <li key={status} className="flex items-center gap-2 text-sm">
                  <span className={cn('size-2.5 shrink-0 rounded-[3px]', STATUS_FILL[status])} aria-hidden />
                  <span className="text-slate-600">{STATUS_LABEL[status]}</span>
                  <span className="tabular ml-auto font-semibold text-slate-900 sm:ml-0">{summary.by_status[status]}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  )
}

function Worklist({
  title,
  description,
  filters,
  showClient,
  emptyText,
  viewAll,
}: {
  title: string
  description?: string
  filters: RequestListFilters
  showClient: boolean
  emptyText: string
  viewAll: string
}) {
  const requests = useRequests({ page_size: 5, ...filters })
  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        actions={
          <Link to={viewAll} className="flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:text-brand-700">
            View all <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        }
      />
      {requests.isPending ? (
        <TableSkeleton rows={3} />
      ) : requests.isError ? (
        <ErrorState message={requests.error.message} onRetry={() => requests.refetch()} />
      ) : requests.data.items.length === 0 ? (
        <EmptyState icon={Inbox} title={emptyText} />
      ) : (
        <ul className="divide-y divide-slate-100">
          {requests.data.items.map((request) => {
            const overdue = isOverdue(request.deadline, request.status)
            return (
              <li key={request.id}>
                <Link
                  to={`/requests/${request.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50/80"
                >
                  <ProgressRing value={request.assigned_count} max={request.episodes_requested} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{request.task_name}</p>
                    <p className="truncate text-xs text-slate-500">
                      #{request.id}
                      {showClient && ` · ${request.client.organisation ?? request.client.name}`} ·{' '}
                      <span className="tabular">
                        {request.assigned_count}/{request.episodes_requested}
                      </span>{' '}
                      episodes · due{' '}
                      <span className={cn(overdue && 'font-semibold text-red-600')}>
                        {formatDate(request.deadline)}
                        {overdue && ' (overdue)'}
                      </span>
                    </p>
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

function ActivityFeed({ showClient }: { showClient: boolean }) {
  const activity = useActivity(8)
  return (
    <Card>
      <CardHeader icon={History} title="Recent activity" description="Latest status changes" />
      {activity.isPending ? (
        <div className="space-y-4 p-5">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-10" />
          ))}
        </div>
      ) : activity.isError ? (
        <ErrorState message={activity.error.message} onRetry={() => activity.refetch()} />
      ) : activity.data.length === 0 ? (
        <EmptyState icon={History} title="No activity yet" />
      ) : (
        <ol className="px-5 py-3">
          {activity.data.map((entry, index) => (
            <li key={`${entry.request_id}-${entry.changed_at}-${index}`} className="relative flex gap-3 py-2.5">
              {index < activity.data.length - 1 && (
                <span className="absolute top-11 bottom-0 left-[15px] w-px bg-slate-100" aria-hidden />
              )}
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600"
                aria-hidden
              >
                {entry.changed_by.name
                  .split(' ')
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join('')}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-slate-700">
                  <span className="font-medium text-slate-900">{entry.changed_by.name}</span>{' '}
                  {entry.previous_status === null ? 'submitted' : 'moved'}{' '}
                  <Link to={`/requests/${entry.request_id}`} className="font-medium text-slate-900 hover:text-brand-700 hover:underline">
                    #{entry.request_id} {entry.task_name}
                  </Link>
                  {entry.previous_status !== null && (
                    <>
                      {' '}
                      to <StatusBadge status={entry.new_status} />
                    </>
                  )}
                </p>
                {entry.comment && <p className="mt-1 truncate text-xs text-slate-500 italic">“{entry.comment}”</p>}
                <p className="mt-0.5 text-xs text-slate-400">
                  {formatRelative(entry.changed_at)}
                  {showClient && ` · ${entry.client.organisation ?? entry.client.name}`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

function DashboardHeader({ user, staff }: { user: User; staff: boolean }) {
  const [now] = useState(() => new Date())
  const today = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <PageHeader
      eyebrow={today}
      title={`${greeting(now.getHours())}, ${user.name.split(' ')[0]}`}
      description={
        staff ? 'Here’s what needs the operations team’s attention.' : `Dataset requests for ${user.organisation ?? user.name}.`
      }
      actions={
        staff ? (
          <>
            <Link to="/episodes" className={buttonStyles('secondary')}>
              <Upload className="size-4" aria-hidden /> Import episodes
            </Link>
            <Link to="/requests" className={buttonStyles()}>
              All requests <ArrowRight className="size-4" aria-hidden />
            </Link>
          </>
        ) : (
          <Link to="/requests/new" className={buttonStyles()}>
            <Plus className="size-4" aria-hidden /> New request
          </Link>
        )
      }
    />
  )
}

export function DashboardPage() {
  const user = useCurrentUser()
  const staff = isStaff(user)
  const summary = useRequestSummary()

  return (
    <>
      <DashboardHeader user={user} staff={staff} />

      <div className="space-y-6">
        {summary.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[0, 1, 2, 3, 4].map((key) => (
              <Skeleton key={key} className="h-32 rounded-2xl" />
            ))}
          </div>
        ) : summary.isError ? (
          <Card>
            <ErrorState message={summary.error.message} onRetry={() => summary.refetch()} />
          </Card>
        ) : (
          <>
            {!staff && summary.data.by_status.delivered > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-white text-brand-600 shadow-sm">
                    <Inbox className="size-[18px]" aria-hidden />
                  </span>
                  <p className="text-sm text-brand-900">
                    <span className="font-semibold">
                      {summary.data.by_status.delivered} deliver{summary.data.by_status.delivered === 1 ? 'y is' : 'ies are'}{' '}
                      waiting for your review.
                    </span>{' '}
                    Accept them, or reject with a reason to request rework.
                  </p>
                </div>
                <Link to="/requests?status=delivered" className={buttonStyles()}>
                  Review now
                </Link>
              </div>
            )}
            <StatTiles tiles={staff ? staffTiles(summary.data) : clientTiles(summary.data)} />
            <Pipeline summary={summary.data} />
          </>
        )}

        <div className="grid gap-6 xl:grid-cols-3">
          <div className="min-w-0 space-y-6 xl:col-span-2">
            {staff ? (
              <>
                <Worklist
                  title="Waiting to start"
                  description="Submitted requests, nearest deadline first"
                  filters={{ status: 'submitted', sort: 'deadline' }}
                  showClient
                  emptyText="Nothing waiting — all caught up"
                  viewAll="/requests?status=submitted&sort=deadline"
                />
                <Worklist
                  title="In progress"
                  description="Nearest deadline first"
                  filters={{ status: 'in_progress', sort: 'deadline' }}
                  showClient
                  emptyText="No requests in progress"
                  viewAll="/requests?status=in_progress&sort=deadline"
                />
              </>
            ) : (
              <>
                <Worklist
                  title="Awaiting your review"
                  description="Delivered datasets to accept or reject"
                  filters={{ status: 'delivered' }}
                  showClient={false}
                  emptyText="No deliveries waiting for you"
                  viewAll="/requests?status=delivered"
                />
                <Worklist
                  title="Recent requests"
                  filters={{ sort: 'newest' }}
                  showClient={false}
                  emptyText="You haven’t submitted any requests yet"
                  viewAll="/requests"
                />
              </>
            )}
          </div>
          <ActivityFeed showClient={staff} />
        </div>
      </div>
    </>
  )
}
