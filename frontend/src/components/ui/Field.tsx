import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/format'

const CONTROL =
  'block w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 shadow-xs transition-colors ' +
  'placeholder:text-zinc-400 hover:border-zinc-400 focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-100 ' +
  'disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500 aria-invalid:border-red-500 aria-invalid:focus:ring-red-100'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, 'h-9', className)} {...props} />
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL, 'h-9 pr-8', className)} {...props}>
      {children}
    </select>
  )
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, 'min-h-24 py-2', className)} {...props} />
}

interface FieldProps {
  label: string
  hint?: string
  error?: string
  className?: string
  /** Render prop receives the ids to wire label, hint and error to the control. */
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode
}

export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-zinc-800">
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-zinc-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
