import { cn, formatNumber } from '../../lib/format'

interface ProgressProps {
  value: number
  max: number
  /** Show "120 / 200 episodes assigned" above the bar. */
  showLabel?: boolean
  className?: string
}

export function Progress({ value, max, showLabel = false, className }: ProgressProps) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0
  const complete = value >= max
  return (
    <div className={className}>
      {showLabel && (
        <div className="mb-2 flex items-baseline justify-between gap-2 text-sm">
          <span className="text-zinc-600">
            <span className="font-semibold text-zinc-900">{formatNumber(value)}</span> / {formatNumber(max)} episodes
            assigned
          </span>
          <span className="tabular text-xs text-zinc-500">{Math.round(ratio * 100)}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={`${value} of ${max} episodes assigned`}
        className={cn('h-1.5 overflow-hidden rounded-full bg-brand-100', complete && 'bg-emerald-100')}
      >
        <div
          className={cn('h-full rounded-full bg-brand-600 transition-[width]', complete && 'bg-emerald-600')}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  )
}
