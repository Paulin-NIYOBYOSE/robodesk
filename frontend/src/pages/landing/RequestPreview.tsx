import { ChevronRight, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { StatusBadge } from '../../components/Badges'
import { Progress } from '../../components/ui/Progress'
import { cn } from '../../lib/format'
import { STATUS_LABEL } from '../../lib/labels'
import type { RequestStatus } from '../../types/api'

interface Step {
  status: RequestStatus
  assigned: number
  actor: string
  action: string
}

// Sample data for the landing page only: one request's life, step by step.
const STEPS: Step[] = [
  { status: 'submitted', assigned: 0, actor: 'Acme Robotics', action: 'submitted the request' },
  { status: 'in_progress', assigned: 0, actor: 'Olu (operator)', action: 'started work' },
  { status: 'in_progress', assigned: 120, actor: 'Olu (operator)', action: 'assigned 120 good episodes' },
  { status: 'in_progress', assigned: 200, actor: 'Odile (operator)', action: 'assigned the last 80 episodes' },
  { status: 'delivered', assigned: 200, actor: 'Odile (operator)', action: 'delivered the dataset' },
  { status: 'accepted', assigned: 200, actor: 'Acme Robotics', action: 'accepted the delivery' },
]
const PIPELINE: RequestStatus[] = ['submitted', 'in_progress', 'delivered', 'accepted']

export function RequestPreview() {
  const [index, setIndex] = useState(0)
  const step = STEPS[index]
  const done = index === STEPS.length - 1

  return (
    <div className="rounded-2xl border border-white/10 bg-white p-5 text-slate-900 shadow-2xl shadow-brand-950/40 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-wider text-brand-600 uppercase">Interactive preview · sample data</p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight">pick cup</h3>
          <p className="text-sm text-slate-500">Request #128 · Acme Robotics · due 30 Oct</p>
        </div>
        <StatusBadge status={step.status} />
      </div>

      {/* Where the request is in its workflow */}
      <ol className="mt-5 grid grid-cols-4 gap-1.5" aria-label="Workflow progress">
        {PIPELINE.map((status) => {
          const reached = PIPELINE.indexOf(status) <= PIPELINE.indexOf(step.status)
          return (
            <li key={status}>
              <div className={cn('h-1.5 rounded-full transition-colors duration-500', reached ? 'bg-brand-600' : 'bg-slate-200')} />
              <p className={cn('mt-1.5 text-[11px] font-medium', reached ? 'text-slate-900' : 'text-slate-400')}>
                {STATUS_LABEL[status]}
              </p>
            </li>
          )
        })}
      </ol>

      <div className="mt-5 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/70 ring-inset">
        <Progress value={step.assigned} max={200} showLabel />
      </div>

      {/* The audit trail grows with every step */}
      <div className="mt-5">
        <p className="text-xs font-semibold text-slate-500">Status history</p>
        <ol className="mt-2 space-y-2" aria-live="polite">
          {STEPS.slice(0, index + 1)
            .map((entry, position) => ({ entry, position }))
            .reverse()
            .slice(0, 3)
            .map(({ entry, position }) => (
              <li key={position} className="flex items-center gap-2.5 text-sm animate-fade-up">
                <span className="size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
                <span className="truncate">
                  <span className="font-medium">{entry.actor}</span> <span className="text-slate-600">{entry.action}</span>
                </span>
              </li>
            ))}
        </ol>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p className="text-xs text-slate-500">
          Step {index + 1} of {STEPS.length}
        </p>
        {done ? (
          <button
            type="button"
            onClick={() => setIndex(0)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw className="size-3.5" aria-hidden /> Replay
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setIndex(index + 1)}
            className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
          >
            Next step <ChevronRight className="size-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  )
}
