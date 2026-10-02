import { formatDateTime } from '../../lib/format'
import { ROLE_LABEL, STATUS_LABEL } from '../../lib/labels'
import type { StatusHistoryEntry } from '../../types/api'

export function StatusTimeline({ history }: { history: StatusHistoryEntry[] }) {
  return (
    <ol className="relative space-y-5 px-5 py-4">
      {history.map((entry, index) => (
        <li key={`${entry.changed_at}-${index}`} className="relative pl-6">
          {index < history.length - 1 && (
            <span className="absolute top-4 bottom-[-1.5rem] left-[5px] w-px bg-zinc-200" aria-hidden />
          )}
          <span
            className="absolute top-1.5 left-0 size-[11px] rounded-full border-2 border-white bg-brand-500 ring-1 ring-zinc-200"
            aria-hidden
          />
          <p className="text-sm text-zinc-900">
            {entry.previous_status === null ? (
              <span className="font-medium">Submitted</span>
            ) : (
              <>
                <span className="text-zinc-500">{STATUS_LABEL[entry.previous_status]} → </span>
                <span className="font-medium">{STATUS_LABEL[entry.new_status]}</span>
              </>
            )}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {entry.changed_by.name} ({ROLE_LABEL[entry.changed_by.role]}) · {formatDateTime(entry.changed_at)}
          </p>
          {entry.comment && (
            <blockquote className="mt-2 rounded-lg bg-zinc-50 px-3 py-2 text-[13px] text-zinc-700 ring-1 ring-zinc-200/70 ring-inset">
              {entry.comment}
            </blockquote>
          )}
        </li>
      ))}
    </ol>
  )
}
