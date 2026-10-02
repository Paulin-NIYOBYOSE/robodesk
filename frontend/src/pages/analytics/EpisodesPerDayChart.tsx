import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
  type TooltipValueType,
} from 'recharts'
import { Card, CardHeader } from '../../components/ui/Card'
import { Table, Td, Th, Tr } from '../../components/ui/Table'
import { cn, formatDate, formatNumber } from '../../lib/format'
import type { Analytics } from '../../types/api'

// Fixed categorical order, validated for colour-vision deficiency. A robot keeps
// its colour regardless of which robots appear in the current range.
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4']
const OTHER = '#94a3b8'
const AXIS_INK = '#64748b'
const GRID = '#e2e8f0'

function robotColor(robotId: string, allRobots: string[]): string {
  const index = allRobots.indexOf(robotId)
  return index >= 0 && index < SERIES.length ? SERIES[index] : OTHER
}

function eachDay(from: string, to: string): string[] {
  const days: string[] = []
  const cursor = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

const shortDate = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

function ChartTooltip({ active, payload, label }: TooltipContentProps<TooltipValueType, string | number>) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((item) => Number(item.value) > 0)
  const total = rows.reduce((sum, item) => sum + Number(item.value), 0)
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium text-slate-900">{formatDate(String(label))}</p>
      {rows.length === 0 && <p className="text-slate-500">No episodes</p>}
      {rows.map((item) => (
        <p key={String(item.dataKey)} className="flex items-center gap-2 py-0.5">
          <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
          <span className="tabular font-semibold text-slate-900">{formatNumber(Number(item.value))}</span>
          <span className="text-slate-500">{String(item.dataKey)}</span>
        </p>
      ))}
      {rows.length > 1 && <p className="mt-1 border-t border-slate-100 pt-1 text-slate-500">Total {formatNumber(total)}</p>}
    </div>
  )
}

interface Props {
  data: Analytics
  robots: string[]
  dimmed: boolean
}

export function EpisodesPerDayChart({ data, robots, dimmed }: Props) {
  const [view, setView] = useState<'chart' | 'table'>('chart')

  const rows = useMemo(() => {
    const byDay = new Map<string, Record<string, number>>()
    for (const { date, robot_id, count } of data.episodes_per_day_by_robot) {
      byDay.set(date, { ...byDay.get(date), [robot_id]: count })
    }
    return eachDay(data.from, data.to).map((date) => ({ date, ...Object.fromEntries(robots.map((r) => [r, 0])), ...byDay.get(date) }))
  }, [data, robots])

  const activeDays = rows.filter((row) => robots.some((robot) => (row as Record<string, number | string>)[robot] !== 0))

  return (
    <Card>
      <CardHeader
        title="Episodes recorded per day"
        description="Stacked by robot · UTC days"
        actions={
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs" role="group" aria-label="View">
            {(['chart', 'table'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => setView(option)}
                className={cn(
                  'rounded-md px-2.5 py-1 font-medium capitalize',
                  view === option ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        }
      />
      <div className={cn('px-5 pt-4 pb-5 transition-opacity', dimmed && 'opacity-60')}>
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Legend">
          {robots.map((robot) => (
            <li key={robot} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: robotColor(robot, robots) }} aria-hidden />
              {robot}
            </li>
          ))}
        </ul>

        {view === 'chart' ? (
          <div className="h-72" role="img" aria-label="Stacked column chart of episodes recorded per day by robot; switch to table view for the values">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -12 }} barCategoryGap="18%">
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDate}
                  tick={{ fontSize: 11, fill: AXIS_INK }}
                  tickLine={false}
                  axisLine={{ stroke: '#cbd5e1' }}
                  minTickGap={24}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: AXIS_INK }} tickLine={false} axisLine={false} />
                <Tooltip content={ChartTooltip} cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }} />
                {robots.map((robot) => (
                  <Bar
                    key={robot}
                    dataKey={robot}
                    stackId="robots"
                    fill={robotColor(robot, robots)}
                    stroke="#ffffff"
                    strokeWidth={1}
                    maxBarSize={24}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : activeDays.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">No episodes recorded in this range.</p>
        ) : (
          <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
            <Table>
              <thead className="sticky top-0">
                <tr>
                  <Th>Date</Th>
                  {robots.map((robot) => (
                    <Th key={robot} className="text-right">
                      {robot}
                    </Th>
                  ))}
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {activeDays.map((row) => {
                  const values = robots.map((robot) => Number((row as Record<string, number | string>)[robot]))
                  return (
                    <Tr key={row.date}>
                      <Td className="whitespace-nowrap">{formatDate(row.date)}</Td>
                      {values.map((value, index) => (
                        <Td key={robots[index]} className="tabular text-right">
                          {value || '—'}
                        </Td>
                      ))}
                      <Td className="tabular text-right font-medium text-slate-900">
                        {values.reduce((sum, value) => sum + value, 0)}
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </Table>
          </div>
        )}
      </div>
    </Card>
  )
}
