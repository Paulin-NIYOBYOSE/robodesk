import { Clapperboard, Search, SearchX, Upload } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { QualityBadge } from '../components/Badges'
import { Button } from '../components/ui/Button'
import { Card, PageHeader } from '../components/ui/Card'
import { Input, Select } from '../components/ui/Field'
import { Pagination } from '../components/ui/Pagination'
import { EmptyState, ErrorState, TableSkeleton } from '../components/ui/States'
import { Table, Td, Th, Tr } from '../components/ui/Table'
import { useEpisodeFacets, useEpisodes } from '../hooks/episodes'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { cn, formatClipLength, formatDateTime } from '../lib/format'
import { QUALITY_LABEL } from '../lib/labels'
import { QUALITIES, type Quality } from '../types/api'
import { ImportDialog } from './episodes/ImportDialog'

const PAGE_SIZE = 25

export function EpisodesPage() {
  const facets = useEpisodeFacets()
  const [taskName, setTaskName] = useState('')
  const [quality, setQuality] = useState<Quality | ''>('')
  const [robot, setRobot] = useState('')
  const [search, setSearch] = useState('')
  const [availableOnly, setAvailableOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [importOpen, setImportOpen] = useState(false)
  const debouncedSearch = useDebouncedValue(search)

  const episodes = useEpisodes({
    task_name: taskName,
    quality,
    robot_id: robot,
    search: debouncedSearch,
    available: availableOnly,
    page,
    page_size: PAGE_SIZE,
  })
  const filtered = Boolean(taskName || quality || robot || search || availableOnly)

  function changeFilter(apply: () => void) {
    apply()
    setPage(1)
  }

  return (
    <>
      <PageHeader
        title="Episodes"
        description="Recorded teleoperation episodes imported from the recording system."
        actions={
          <Button onClick={() => setImportOpen(true)}>
            <Upload className="size-4" aria-hidden /> Import CSV
          </Button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-4">
          <label className="relative min-w-44 flex-1 sm:max-w-60">
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
            <Select value={taskName} onChange={(event) => changeFilter(() => setTaskName(event.target.value))}>
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
              checked={availableOnly}
              onChange={(event) => changeFilter(() => setAvailableOnly(event.target.checked))}
            />
            Available only
          </label>
        </div>

        {episodes.isPending ? (
          <TableSkeleton />
        ) : episodes.isError ? (
          <ErrorState message={episodes.error.message} onRetry={() => episodes.refetch()} />
        ) : episodes.data.items.length === 0 ? (
          filtered ? (
            <EmptyState icon={SearchX} title="No episodes match these filters" />
          ) : (
            <EmptyState
              icon={Clapperboard}
              title="No episodes yet"
              description="Import a CSV export from the recording system to get started."
              action={
                <Button onClick={() => setImportOpen(true)}>
                  <Upload className="size-4" aria-hidden /> Import CSV
                </Button>
              }
            />
          )
        ) : (
          <div className={cn(episodes.isPlaceholderData && 'opacity-60')}>
            <Table>
              <thead>
                <tr>
                  <Th>Episode</Th>
                  <Th>Task</Th>
                  <Th>Robot</Th>
                  <Th>Recorded</Th>
                  <Th>Length</Th>
                  <Th>Operator</Th>
                  <Th>Quality</Th>
                  <Th>Assignment</Th>
                </tr>
              </thead>
              <tbody>
                {episodes.data.items.map((episode) => (
                  <Tr key={episode.id}>
                    <Td className="font-mono text-[13px] whitespace-nowrap text-slate-900">{episode.episode_id}</Td>
                    <Td className="whitespace-nowrap">{episode.task_name}</Td>
                    <Td className="whitespace-nowrap">{episode.robot_id}</Td>
                    <Td className="whitespace-nowrap">{formatDateTime(episode.recorded_at)}</Td>
                    <Td className="tabular whitespace-nowrap">{formatClipLength(episode.duration_seconds)}</Td>
                    <Td>{episode.operator_name}</Td>
                    <Td>
                      <QualityBadge quality={episode.quality} />
                    </Td>
                    <Td className="text-xs whitespace-nowrap">
                      {episode.assigned_request_id ? (
                        <Link
                          to={`/requests/${episode.assigned_request_id}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          Request #{episode.assigned_request_id}
                        </Link>
                      ) : episode.quality === 'bad' ? (
                        <span className="text-slate-400">Not assignable</span>
                      ) : (
                        <span className="text-emerald-700">Available</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} total={episodes.data.total} onPageChange={setPage} />
          </div>
        )}
      </Card>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  )
}
