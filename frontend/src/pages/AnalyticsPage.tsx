import { BarChart3 } from 'lucide-react'
import { useState } from 'react'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { Input } from '../components/ui/Field'
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States'
import { useAnalytics } from '../hooks/analytics'
import { useEpisodeFacets } from '../hooks/episodes'
import { addDays, cn, formatElapsed, formatNumber, isoDate } from '../lib/format'
import { STATUS_LABEL } from '../lib/labels'
import { REQUEST_STATUSES } from '../types/api'
import { EpisodesPerDayChart } from './analytics/EpisodesPerDayChart'

const PRESETS = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '1 year', days: 365 },
]

function StatTile({ label, value, caption }: { label: string; value: string; caption?: string }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-[13px] text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">{value}</p>
      {caption && <p className="mt-0.5 text-xs text-zinc-500">{caption}</p>}
    </Card>
  )
}

/** Horizontal bars in a single hue: these categories are compared by size, not told apart by colour. */
function BarList({ rows, emptyText }: { rows: { label: string; value: number }[]; emptyText: string }) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  if (rows.every((row) => row.value === 0)) return <p className="px-5 py-10 text-center text-sm text-zinc-500">{emptyText}</p>
  return (
    <ul className="space-y-3 px-5 py-4">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="truncate text-zinc-700">{row.label}</span>
            <span className="tabular font-medium text-zinc-900">{formatNumber(row.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-100">
            <div
              className="h-2 rounded-full bg-[#2a78d6]"
              style={{ width: `${(row.value / max) * 100}%`, minWidth: row.value > 0 ? 4 : 0 }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

export function AnalyticsPage() {
  const [today] = useState(() => isoDate(new Date()))
  const [from, setFrom] = useState(() => addDays(today, -89))
  const [to, setTo] = useState(today)
  const analytics = useAnalytics(from, to)
  const facets = useEpisodeFacets()
  const invalidRange = !from || !to || from > to

  const data = analytics.data
  const robots = facets.data?.robots ?? [...new Set(data?.episodes_per_day_by_robot.map((row) => row.robot_id))].sort()
  const totalEpisodes = data?.episodes_per_day_by_robot.reduce((sum, row) => sum + row.count, 0) ?? 0
  const fulfilment = data?.request_fulfilment

  return (
    <>
      <PageHeader title="Analytics" description="Recording throughput and request fulfilment, computed by the database." />

      {/* One filter row scopes every figure below it. */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 shadow-xs" role="group" aria-label="Date range presets">
          {PRESETS.map((preset) => {
            const active = from === addDays(today, 1 - preset.days) && to === today
            return (
              <button
                key={preset.days}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setFrom(addDays(today, 1 - preset.days))
                  setTo(today)
                }}
                className={cn(
                  'rounded-md px-3 py-1.5 text-[13px] font-medium',
                  active ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100',
                )}
              >
                {preset.label}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-600">
          <label className="sr-only" htmlFor="analytics-from">
            From
          </label>
          <Input id="analytics-from" type="date" className="w-40" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          <span aria-hidden>–</span>
          <label className="sr-only" htmlFor="analytics-to">
            To
          </label>
          <Input id="analytics-to" type="date" className="w-40" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {invalidRange ? (
        <Card>
          <EmptyState icon={BarChart3} title="Choose a valid date range" description="The start date must be on or before the end date." />
        </Card>
      ) : analytics.isError ? (
        <Card>
          <ErrorState message={analytics.error.message} onRetry={() => analytics.refetch()} />
        </Card>
      ) : !data || !fulfilment ? (
        <div className="space-y-6" role="status" aria-label="Loading analytics">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className={cn('grid gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-4', analytics.isPlaceholderData && 'opacity-60')}>
            <StatTile label="Episodes recorded" value={formatNumber(totalEpisodes)} caption="All qualities, in range" />
            <StatTile label="Requests submitted" value={formatNumber(fulfilment.total)} caption="Created in range" />
            <StatTile
              label="Requests delivered"
              value={formatNumber(fulfilment.delivered_requests)}
              caption="Of those submitted in range"
            />
            <StatTile
              label="Median time to delivery"
              value={fulfilment.median_seconds_to_delivery === null ? '—' : formatElapsed(fulfilment.median_seconds_to_delivery)}
              caption="Submitted → first delivery"
            />
          </div>

          <EpisodesPerDayChart data={data} robots={robots} dimmed={analytics.isPlaceholderData} />

          <div className={cn('grid gap-6 transition-opacity lg:grid-cols-2', analytics.isPlaceholderData && 'opacity-60')}>
            <Card>
              <CardHeader title="Requests by status" description="Current status of requests submitted in range" />
              <BarList
                rows={REQUEST_STATUSES.map((status) => ({ label: STATUS_LABEL[status], value: fulfilment.counts_by_status[status] }))}
                emptyText="No requests were submitted in this range."
              />
            </Card>
            <Card>
              <CardHeader title="Top tasks by good episodes" description="Five tasks with the most good-quality recordings" />
              <BarList
                rows={data.top_tasks_by_good_episodes.map((task) => ({ label: task.task_name, value: task.good_episodes }))}
                emptyText="No good episodes recorded in this range."
              />
            </Card>
          </div>
        </div>
      )}
    </>
  )
}
