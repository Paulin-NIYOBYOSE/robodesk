import { cn } from '../lib/format'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn('size-8', className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-brand-600" />
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
