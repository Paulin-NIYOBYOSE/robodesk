import type { RequestStatus } from '../types/api'

const dateFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const dateTimeFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const numberFormat = new Intl.NumberFormat('en-GB')

/** Dates without a time ("2026-09-01") are calendar days: format them without timezone shifts. */
export function formatDate(value: string): string {
  const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value)
  return dateFormat.format(date)
}

export function formatDateTime(value: string): string {
  return dateTimeFormat.format(new Date(value))
}

const relativeFormat = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' })

/** "just now", "5 minutes ago", "yesterday"; falls back to a date after a week. */
export function formatRelative(value: string, now: number = Date.now()): string {
  const seconds = Math.round((new Date(value).getTime() - now) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 45) return 'just now'
  if (abs < 3600) return relativeFormat.format(Math.round(seconds / 60), 'minute')
  if (abs < 86_400) return relativeFormat.format(Math.round(seconds / 3600), 'hour')
  if (abs < 7 * 86_400) return relativeFormat.format(Math.round(seconds / 86_400), 'day')
  return formatDate(value)
}

export function formatNumber(value: number): string {
  return numberFormat.format(value)
}

/** Episode length: "45s", "1m 32s". */
export function formatClipLength(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`
}

/** Elapsed time at a human scale: "45 min", "5.2 h", "3.1 days". */
export function formatElapsed(seconds: number): string {
  const hours = seconds / 3600
  if (hours < 1) return `${Math.max(1, Math.round(seconds / 60))} min`
  if (hours < 48) return `${hours.toFixed(1)} h`
  return `${(hours / 24).toFixed(1)} days`
}

/** Local calendar date as YYYY-MM-DD (for <input type="date">). */
export function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Shift a YYYY-MM-DD calendar date by whole days. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00`)
  date.setDate(date.getDate() + days)
  return isoDate(date)
}

const WAITING_ON_OPERATIONS: RequestStatus[] = ['submitted', 'in_progress', 'rejected']

/** Past its deadline while the operations team still owes work (same rule as the API). */
export function isOverdue(deadline: string, status: RequestStatus): boolean {
  return WAITING_ON_OPERATIONS.includes(status) && deadline < isoDate(new Date())
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}
