import { cn } from '../../lib/format'

/** Compact circular progress for list rows; the numbers stay visible next to it. */
export function ProgressRing({ value, max, size = 36 }: { value: number; max: number; size?: number }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0
  const stroke = 3.5
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const complete = value >= max
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0 -rotate-90"
      role="img"
      aria-label={`${value} of ${max} episodes assigned`}
    >
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-slate-100" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - ratio)}
        className={cn('transition-[stroke-dashoffset] duration-700', complete ? 'stroke-emerald-500' : 'stroke-brand-600')}
      />
    </svg>
  )
}
