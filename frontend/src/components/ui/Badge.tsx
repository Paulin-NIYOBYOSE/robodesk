import type { ReactNode } from 'react'
import { cn } from '../../lib/format'

export type Tone = 'neutral' | 'blue' | 'amber' | 'green' | 'red' | 'violet'

const TONES: Record<Tone, string> = {
  neutral: 'bg-zinc-100 text-zinc-700 ring-zinc-500/15',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/15',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/15',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/15',
}

const DOTS: Record<Tone, string> = {
  neutral: 'bg-zinc-400',
  blue: 'bg-blue-500',
  amber: 'bg-amber-500',
  green: 'bg-emerald-500',
  red: 'bg-red-500',
  violet: 'bg-violet-500',
}

interface BadgeProps {
  tone?: Tone
  dot?: boolean
  children: ReactNode
  className?: string
}

export function Badge({ tone = 'neutral', dot = false, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      {dot && <span className={cn('size-1.5 rounded-full', DOTS[tone])} aria-hidden />}
      {children}
    </span>
  )
}
