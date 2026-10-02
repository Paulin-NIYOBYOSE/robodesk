import { CircleCheck, CircleMinus, CircleX } from 'lucide-react'
import { useState } from 'react'
import { Badge, type Tone } from '../../components/ui/Badge'
import { cn } from '../../lib/format'

type Outcome = 'imported' | 'skipped' | 'rejected'

interface Row {
  line: number
  raw: string
  outcome: Outcome
  title: string
  detail: string
}

// Real rows from seed/episodes.csv and what the importer reports for each.
const ROWS: Row[] = [
  {
    line: 32,
    raw: 'EP-00008, arm-01,pick cup,2026-08-05T13:18:00,53,Diane,bad',
    outcome: 'imported',
    title: 'Imported after clean-up',
    detail: 'The stray space in " arm-01" is trimmed. Safe, unambiguous normalisation is applied and counted in the report.',
  },
  {
    line: 163,
    raw: 'EP-00007,arm-03,PICK CUP,2026-08-16T19:38:00,35,Diane,good',
    outcome: 'imported',
    title: 'Imported after clean-up',
    detail: 'Task names are case-insensitive, so "PICK CUP" is stored as "pick cup" and matches client requests.',
  },
  {
    line: 29,
    raw: 'EP-00014,arm-03,open drawer,14/08/2026 09:15,34,Kevin,good',
    outcome: 'imported',
    title: 'Imported after clean-up',
    detail: 'A day-first date is read as 14 Aug 2026, 09:15 UTC. Only explicitly supported layouts are accepted.',
  },
  {
    line: 50,
    raw: 'EP-00074,mobile-01,wipe table,2026-08-30T04:48:00,43,Aline,good',
    outcome: 'skipped',
    title: 'Skipped duplicate',
    detail: 'An identical copy appeared earlier in the file (line 38). Re-running the same import skips every row like this, so it creates nothing twice.',
  },
  {
    line: 168,
    raw: 'EP-00011,arm-03,pour water,2026-09-10T15:08:00,32,Kevin,good',
    outcome: 'rejected',
    title: 'Rejected: conflicting duplicate',
    detail: 'EP-00011 was already imported as "bad" from line 3. The stored record is kept and the conflict is reported, never silently overwritten.',
  },
  {
    line: 66,
    raw: 'EP-00018,arm-01,wipe table,2026-08-11T18:10:00,45.5,Patrick,good',
    outcome: 'rejected',
    title: 'Rejected: invalid duration',
    detail: '"45.5" is not a whole number of seconds. Questionable values are reported with their line number, not guessed.',
  },
  {
    line: 162,
    raw: 'EP-00024,arm-99,place cup on shelf,2026-09-09T12:33:00,88,Eric,usable',
    outcome: 'rejected',
    title: 'Rejected: unknown robot',
    detail: 'arm-99 is not one of the five known robots, which are kept in a reference table.',
  },
  {
    line: 185,
    raw: 'EP-90001,arm-02,open drawer,2026-08-20T10:00:00,30',
    outcome: 'rejected',
    title: 'Rejected: malformed row',
    detail: 'Expected 7 fields, found 5. One bad row never stops the rest of the file importing.',
  },
]

const STYLE: Record<Outcome, { tone: Tone; icon: typeof CircleCheck; label: string }> = {
  imported: { tone: 'green', icon: CircleCheck, label: 'Imported' },
  skipped: { tone: 'amber', icon: CircleMinus, label: 'Skipped' },
  rejected: { tone: 'red', icon: CircleX, label: 'Rejected' },
}

export function ImportExplorer() {
  const [selected, setSelected] = useState(0)
  const row = ROWS[selected]
  const { icon: Icon, tone, label } = STYLE[row.outcome]

  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-card">
        <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
          <span className="size-2.5 rounded-full bg-slate-700" />
          <span className="size-2.5 rounded-full bg-slate-700" />
          <span className="size-2.5 rounded-full bg-slate-700" />
          <span className="ml-2 font-mono text-xs text-slate-400">seed/episodes.csv</span>
        </div>
        <ul className="divide-y divide-white/5" role="listbox" aria-label="Rows from the supplied CSV">
          {ROWS.map((item, index) => {
            const style = STYLE[item.outcome]
            return (
              <li key={item.line}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected === index}
                  onClick={() => setSelected(index)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-left font-mono text-[12px] transition-colors',
                    selected === index ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
                  )}
                >
                  <span className="w-7 shrink-0 text-right text-slate-600">{item.line}</span>
                  <span className="min-w-0 flex-1 truncate">{item.raw}</span>
                  <style.icon
                    className={cn(
                      'size-4 shrink-0',
                      item.outcome === 'imported' && 'text-emerald-400',
                      item.outcome === 'skipped' && 'text-amber-400',
                      item.outcome === 'rejected' && 'text-red-400',
                    )}
                    aria-label={style.label}
                  />
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
        <div className="flex items-center gap-2">
          <Icon
            className={cn(
              'size-5',
              row.outcome === 'imported' && 'text-emerald-600',
              row.outcome === 'skipped' && 'text-amber-600',
              row.outcome === 'rejected' && 'text-red-600',
            )}
            aria-hidden
          />
          <Badge tone={tone}>{label}</Badge>
          <span className="text-xs text-slate-400">line {row.line}</span>
        </div>
        <h3 className="mt-3 text-lg font-semibold tracking-tight text-slate-900">{row.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600" aria-live="polite">
          {row.detail}
        </p>
        <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-slate-100 pt-5 text-center">
          {[
            ['171', 'imported'],
            ['2', 'duplicates'],
            ['16', 'rejected'],
          ].map(([value, caption]) => (
            <div key={caption} className="rounded-lg bg-slate-50 py-2.5">
              <dt className="sr-only">{caption}</dt>
              <dd className="text-xl font-semibold text-slate-900">{value}</dd>
              <dd className="text-[11px] text-slate-500">{caption}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-slate-500">The full supplied file. Importing it a second time adds 0 rows.</p>
      </div>
    </div>
  )
}
