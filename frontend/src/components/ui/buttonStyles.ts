import { cn } from '../../lib/format'

export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type Size = 'sm' | 'md'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 disabled:bg-brand-600/50',
  secondary: 'border border-zinc-300 bg-white text-zinc-800 shadow-xs hover:bg-zinc-50 disabled:text-zinc-400',
  ghost: 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 disabled:text-zinc-400',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 disabled:bg-red-600/50',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-2.5 text-[13px]',
  md: 'h-9 gap-2 px-3.5 text-sm',
}

/** Button look for other elements (e.g. a router <Link> that should look like a button). */
export function buttonStyles(variant: Variant = 'primary', size: Size = 'md', className?: string): string {
  return cn(
    'inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed',
    VARIANTS[variant],
    SIZES[size],
    className,
  )
}
