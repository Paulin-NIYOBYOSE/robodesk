import { CheckCircle2, FileUp } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Table, Td, Th, Tr } from '../../components/ui/Table'
import { useImportEpisodes } from '../../hooks/episodes'
import { cn, formatNumber } from '../../lib/format'
import type { ImportReport } from '../../types/api'

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'green' | 'amber' | 'red' }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2.5">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-lg font-semibold text-slate-900',
          tone === 'green' && value > 0 && 'text-emerald-700',
          tone === 'amber' && value > 0 && 'text-amber-700',
          tone === 'red' && value > 0 && 'text-red-700',
        )}
      >
        {formatNumber(value)}
      </p>
    </div>
  )
}

function ReportView({ report }: { report: ImportReport }) {
  return (
    <div className="space-y-5 pb-1">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Rows processed" value={report.processed} />
        <Stat label="Imported" value={report.imported} tone="green" />
        <Stat label="Skipped duplicates" value={report.skipped_duplicates} tone="amber" />
        <Stat label="Rejected" value={report.rejected} tone="red" />
      </div>
      <p className="text-[13px] text-slate-500">
        {formatNumber(report.normalized)} imported rows were cleaned up (whitespace, letter case or date layout).
        {report.blank_lines > 0 && ` ${formatNumber(report.blank_lines)} blank lines were ignored.`} Re-importing the
        same file is safe: existing episodes are never duplicated or overwritten.
      </p>

      {report.reasons.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Reasons</h3>
          <ul className="grid gap-x-8 rounded-lg border border-slate-200 px-3 py-2 sm:grid-cols-2">
            {report.reasons.map((reason) => (
              <li key={reason.code} className="flex justify-between gap-3 py-1 text-sm">
                <span className="text-slate-700">{reason.label}</span>
                <span className="tabular font-medium text-slate-900">{formatNumber(reason.count)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.issues.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900">Rejected rows</h3>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
            <Table>
              <thead className="sticky top-0">
                <tr>
                  <Th>Line</Th>
                  <Th>Episode</Th>
                  <Th>Problem</Th>
                </tr>
              </thead>
              <tbody>
                {report.issues.map((issue) => (
                  <Tr key={`${issue.line}-${issue.code}`}>
                    <Td className="tabular text-slate-500">{issue.line}</Td>
                    <Td className="font-mono text-[13px] whitespace-nowrap">{issue.episode_id ?? '—'}</Td>
                    <Td className="text-[13px]">{issue.message}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
          {report.issues_truncated && (
            <p className="mt-2 text-xs text-slate-500">
              Showing the first {report.issues.length} of {formatNumber(report.rejected)} rejected rows.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const importEpisodes = useImportEpisodes()
  const report = importEpisodes.data

  function close() {
    setFile(null)
    importEpisodes.reset()
    onClose()
  }

  function upload() {
    if (!file) return
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error('File too large', { description: 'Uploads are limited to 50 MB. Use the import CLI for bulk loads.' })
      return
    }
    importEpisodes.mutate(file, {
      onSuccess: (result) =>
        toast.success('Import finished', {
          description: `${formatNumber(result.imported)} new · ${formatNumber(result.skipped_duplicates)} duplicates skipped · ${formatNumber(result.rejected)} rejected`,
        }),
      onError: (error) => toast.error('Import failed', { description: error.message }),
    })
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      size="xl"
      title={report ? 'Import report' : 'Import episodes'}
      description={
        report ? undefined : 'Upload a CSV export from the recording system. Rows with problems are reported, not guessed.'
      }
      footer={
        report ? (
          <Button onClick={close}>
            <CheckCircle2 className="size-4" aria-hidden /> Done
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={importEpisodes.isPending}>
              Cancel
            </Button>
            <Button onClick={upload} disabled={!file} loading={importEpisodes.isPending}>
              {importEpisodes.isPending ? 'Importing…' : 'Import'}
            </Button>
          </>
        )
      }
    >
      {report ? (
        <ReportView report={report} />
      ) : (
        <div className="pb-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center rounded-xl border border-dashed border-slate-300 px-6 py-8 text-center transition-colors hover:border-brand-500 hover:bg-brand-50/40"
          >
            <FileUp className="size-6 text-slate-400" aria-hidden />
            <span className="mt-2 text-sm font-medium text-slate-900">{file ? file.name : 'Choose a CSV file'}</span>
            <span className="mt-1 text-xs text-slate-500">
              {file ? `${formatNumber(Math.ceil(file.size / 1024))} KB` : 'UTF-8, up to 50 MB'}
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <p className="mt-3 text-xs text-slate-500">
            Expected columns: episode_id, robot_id, task_name, recorded_at, duration_seconds, operator_name, quality.
          </p>
        </div>
      )}
    </Dialog>
  )
}
