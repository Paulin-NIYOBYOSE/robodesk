import { useId } from 'react'
import { cn } from '../lib/format'

export function LogoMark({ className }: { className?: string }) {
  const gradientId = useId()
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn('size-8 shrink-0', className)} aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradientId})`} />
      <path
        d="M9 24h14M12 24v-5l5-7 5 3"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17" cy="12" r="2.2" fill="#fff" />
    </svg>
  )
}

/** Logo mark plus wordmark. `tone` picks the text colour for light or dark backgrounds. */
export function Logo({ tone = 'dark', subtitle }: { tone?: 'dark' | 'light'; subtitle?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="leading-tight">
        <span className={cn('block text-[15px] font-semibold tracking-tight', tone === 'light' ? 'text-white' : 'text-slate-900')}>
          RoboDesk
        </span>
        {subtitle && (
          <span className={cn('block text-[11px]', tone === 'light' ? 'text-slate-400' : 'text-slate-500')}>{subtitle}</span>
        )}
      </span>
    </span>
  )
}
