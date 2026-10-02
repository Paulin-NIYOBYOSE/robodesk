import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatNumber } from '../../lib/format'
import { Button } from './Button'

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-3 border-t border-zinc-100 px-5 py-3 text-[13px] text-zinc-500"
    >
      <p className="tabular">
        {formatNumber(first)}–{formatNumber(last)} of {formatNumber(total)}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
          <ChevronLeft className="size-4" aria-hidden /> Previous
        </Button>
        <span className="tabular px-1">
          {page} / {pages}
        </span>
        <Button variant="ghost" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= pages}>
          Next <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </nav>
  )
}
