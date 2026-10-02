import { Search, SearchX } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { QualityBadge } from '../../components/Badges'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Input, Select } from '../../components/ui/Field'
import { Pagination } from '../../components/ui/Pagination'
import { EmptyState, ErrorState, TableSkeleton } from '../../components/ui/States'
import { Table, Td, Th, Tr } from '../../components/ui/Table'
import { useEpisodeFacets, useEpisodes } from '../../hooks/episodes'
import { useAssignEpisodes } from '../../hooks/requests'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { cn, formatDateTime } from '../../lib/format'
import { QUALITY_LABEL } from '../../lib/labels'
import { QUALITIES, type Episode, type Quality, type RequestDetail } from '../../types/api'

const PAGE_SIZE = 10

/** Why an episode cannot be assigned, or null if it can. Mirrors the API's rules for display only. */
function unavailableReason(episode: Episode, requestId: number): string | null {
  if (episode.assigned_request_id === requestId) return 'In this request'
  if (episode.assigned_request_id !== null) return `Assigned to #${episode.assigned_request_id}`
  if (episode.quality === 'bad') return 'Bad quality'
  return null
}

export function EpisodePicker({ request }: { request: RequestDetail }) {
  const facets = useEpisodeFacets()
  const [taskName, setTaskName] = useState<string | null>(null) // null = default to the request's task
  const [quality, setQuality] = useState<Quality | ''>('')
  const [robot, setRobot] = useState('')
  const [search, setSearch] = useState('')
  const [hideUnavailable, setHideUnavailable] = useState(false)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const assign = useAssignEpisodes(request.id)

  const defaultTask = facets.data?.task_names.includes(request.task_name) ? request.task_name : ''
  const effectiveTask = taskName ?? defaultTask
  const debouncedSearch = useDebouncedValue(search)
  const episodes = useEpisodes(
    {
      task_name: effectiveTask,
      quality,
      robot_id: robot,
      search: debouncedSearch,
      available: hideUnavailable,
      page,
      page_size: PAGE_SIZE,
    },
    !facets.isPending, // wait for the task list so the default task filter is known
  )
  const remaining = request.episodes_requested - request.assigned_count

  /** Any filter change resets paging and selection, so nothing off-screen stays selected. */
  function changeFilter(apply: () => void) {
    apply()
    setPage(1)
    setSelected(new Set())
  }

  const selectable = (episodes.data?.items ?? []).filter((e) => unavailableReason(e, request.id) === null)
  const allOnPageSelected = selectable.length > 0 && selectable.every((e) => selected.has(e.id))

  function toggle(id: number) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function togglePage() {
    setSelected((current) => {
      const next = new Set(current)
      for (const episode of selectable) {
        if (allOnPageSelected) next.delete(episode.id)
        else next.add(episode.id)
      }
      return next
    })
  }

  function assignSelected() {
    const ids = [...selected]
    assign.mutate(ids, {
      onSuccess: (result) => {
        toast.success(`Assigned ${result.assigned} episode${result.assigned === 1 ? '' : 's'}`, {
          description: `${result.assigned_count} / ${result.episodes_requested} now assigned.`,
        })
        setSelected(new Set())
      },
      onError: (error) => toast.error('Could not assign episodes', { description: error.message }),
    })
  }

  const tooMany = selected.size > remaining

  return (
    <Card>
      <CardHeader
        title="Add episodes"
        description={
          remaining > 0
            ? `${remaining} more needed. Only good or usable episodes that are not in another request can be assigned.`
            : 'This request has all the episodes it asked for.'
        }
      />

      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
        <label className="relative min-w-40 flex-1 sm:max-w-52">
          <span className="sr-only">Search episode ID</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="Episode ID, e.g. EP-001"
            value={search}
            onChange={(event) => changeFilter(() => setSearch(event.target.value))}
          />
        </label>
        <label>
          <span className="sr-only">Task</span>
          <Select value={effectiveTask} onChange={(event) => changeFilter(() => setTaskName(event.target.value))}>
            <option value="">All tasks</option>
            {facets.data?.task_names.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span className="sr-only">Quality</span>
          <Select value={quality} onChange={(event) => changeFilter(() => setQuality(event.target.value as Quality | ''))}>
            <option value="">Any quality</option>
            {QUALITIES.map((value) => (
              <option key={value} value={value}>
                {QUALITY_LABEL[value]}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span className="sr-only">Robot</span>
          <Select value={robot} onChange={(event) => changeFilter(() => setRobot(event.target.value))}>
            <option value="">All robots</option>
            {facets.data?.robots.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            className="size-4 rounded border-slate-300 accent-brand-600"
            checked={hideUnavailable}
            onChange={(event) => changeFilter(() => setHideUnavailable(event.target.checked))}
          />
          Hide unavailable
        </label>
      </div>

      {episodes.isPending ? (
        <TableSkeleton rows={5} />
      ) : episodes.isError ? (
        <ErrorState message={episodes.error.message} onRetry={() => episodes.refetch()} />
      ) : episodes.data.items.length === 0 ? (
        <EmptyState icon={SearchX} title="No episodes match" description="Try another task, robot or quality." />
      ) : (
        <div className={cn(episodes.isPlaceholderData && 'opacity-60')}>
          <Table>
            <thead>
              <tr>
                <Th className="w-0">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-slate-300 accent-brand-600"
                    aria-label="Select all available episodes on this page"
                    checked={allOnPageSelected}
                    disabled={selectable.length === 0}
                    onChange={togglePage}
                  />
                </Th>
                <Th>Episode</Th>
                <Th>Task</Th>
                <Th>Robot</Th>
                <Th>Recorded</Th>
                <Th>Quality</Th>
                <Th>Availability</Th>
              </tr>
            </thead>
            <tbody>
              {episodes.data.items.map((episode) => {
                const reason = unavailableReason(episode, request.id)
                return (
                  <Tr key={episode.id} className={cn(reason && 'bg-slate-50/60 text-slate-400')}>
                    <Td>
                      <input
                        type="checkbox"
                        className="size-4 rounded border-slate-300 accent-brand-600 disabled:opacity-40"
                        aria-label={`Select ${episode.episode_id}`}
                        checked={selected.has(episode.id)}
                        disabled={reason !== null}
                        onChange={() => toggle(episode.id)}
                      />
                    </Td>
                    <Td className={cn('font-mono text-[13px] whitespace-nowrap', reason ? 'text-slate-400' : 'text-slate-900')}>
                      {episode.episode_id}
                    </Td>
                    <Td className={cn('whitespace-nowrap', reason && 'text-slate-400')}>{episode.task_name}</Td>
                    <Td className={cn('whitespace-nowrap', reason && 'text-slate-400')}>{episode.robot_id}</Td>
                    <Td className={cn('whitespace-nowrap', reason && 'text-slate-400')}>
                      {formatDateTime(episode.recorded_at)}
                    </Td>
                    <Td>
                      <QualityBadge quality={episode.quality} />
                    </Td>
                    <Td className="whitespace-nowrap text-xs">
                      {reason === null ? (
                        <span className="font-medium text-emerald-700">Available</span>
                      ) : episode.assigned_request_id && episode.assigned_request_id !== request.id ? (
                        <Link to={`/requests/${episode.assigned_request_id}`} className="text-slate-500 underline">
                          {reason}
                        </Link>
                      ) : (
                        <span className="text-slate-500">{reason}</span>
                      )}
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={episodes.data.total} onPageChange={setPage} />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t border-slate-200 bg-slate-50 px-5 py-3">
        <p className={cn('text-sm', tooMany ? 'font-medium text-red-600' : 'text-slate-600')} aria-live="polite">
          {tooMany
            ? `${selected.size} selected — this request only needs ${remaining} more`
            : `${selected.size} selected`}
        </p>
        <Button onClick={assignSelected} disabled={selected.size === 0 || tooMany} loading={assign.isPending}>
          Assign {selected.size > 0 ? selected.size : ''} episode{selected.size === 1 ? '' : 's'}
        </Button>
      </div>
    </Card>
  )
}
