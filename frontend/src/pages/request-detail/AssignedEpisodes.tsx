import { Clapperboard, RotateCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ExportBadge, QualityBadge } from '../../components/Badges'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Pagination } from '../../components/ui/Pagination'
import { EmptyState, ErrorState, TableSkeleton } from '../../components/ui/States'
import { Table, Td, Th, Tr } from '../../components/ui/Table'
import { useAssignments, useRetryExport, useUnassignEpisode } from '../../hooks/requests'
import { cn, formatClipLength, formatDateTime } from '../../lib/format'
import type { RequestDetail } from '../../types/api'

const PAGE_SIZE = 10

interface Props {
  request: RequestDetail
  /** Operator view while the request is in progress: episodes can be removed. */
  editable: boolean
  /** Operator view: failed exports can be retried. */
  staff: boolean
}

export function AssignedEpisodes({ request, editable, staff }: Props) {
  const [page, setPage] = useState(1)
  const assignments = useAssignments(request.id, page, PAGE_SIZE)
  const unassign = useUnassignEpisode(request.id)
  const retryExport = useRetryExport(request.id)

  function remove(episodeId: number, label: string) {
    unassign.mutate(episodeId, {
      onSuccess: () => toast.success(`Removed ${label} from this request`),
      onError: (error) => toast.error('Could not remove the episode', { description: error.message }),
    })
  }

  function retry(episodeId: number, label: string) {
    retryExport.mutate(episodeId, {
      onSuccess: () => toast.success(`Export of ${label} queued again`),
      onError: (error) => toast.error('Could not retry the export', { description: error.message }),
    })
  }

  return (
    <Card>
      <CardHeader
        title="Assigned episodes"
        description={
          editable
            ? 'Each episode is exported in the background. Episodes can be removed while the request is in progress.'
            : 'Each episode is exported to the delivery bucket in the background.'
        }
      />
      {assignments.isPending ? (
        <TableSkeleton rows={4} />
      ) : assignments.isError ? (
        <ErrorState message={assignments.error.message} onRetry={() => assignments.refetch()} />
      ) : assignments.data.total === 0 ? (
        <EmptyState
          icon={Clapperboard}
          title="No episodes assigned yet"
          description={editable ? 'Use the episode browser below to assign recordings.' : undefined}
        />
      ) : (
        <div className={cn(assignments.isPlaceholderData && 'opacity-60')}>
          <Table>
            <thead>
              <tr>
                <Th>Episode</Th>
                <Th>Recorded</Th>
                <Th>Quality</Th>
                <Th>Assigned by</Th>
                <Th>Export</Th>
                {editable && <Th className="w-0" aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {assignments.data.items.map((assignment) => {
                const { episode, assigned_by, assigned_at } = assignment
                return (
                  <Tr key={episode.id}>
                    <Td className="whitespace-nowrap">
                      <div className="font-mono text-[13px] text-slate-900">{episode.episode_id}</div>
                      <div className="text-xs text-slate-500">
                        {episode.robot_id} · {formatClipLength(episode.duration_seconds)}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">{formatDateTime(episode.recorded_at)}</Td>
                    <Td>
                      <QualityBadge quality={episode.quality} />
                    </Td>
                    <Td className="whitespace-nowrap text-slate-500">
                      {assigned_by.name}
                      <div className="text-xs">{formatDateTime(assigned_at)}</div>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <ExportBadge assignment={assignment} />
                        {staff && assignment.export_status === 'failed' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="px-1.5"
                            onClick={() => retry(episode.id, episode.episode_id)}
                            disabled={retryExport.isPending}
                            aria-label={`Retry export of ${episode.episode_id}`}
                            title="Retry export"
                          >
                            <RotateCw className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </Td>
                    {editable && (
                      <Td>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="px-2 text-slate-500 hover:text-red-600"
                          onClick={() => remove(episode.id, episode.episode_id)}
                          disabled={unassign.isPending}
                          aria-label={`Remove ${episode.episode_id}`}
                          title="Remove from request"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </Td>
                    )}
                  </Tr>
                )
              })}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={assignments.data.total} onPageChange={setPage} />
        </div>
      )}
    </Card>
  )
}
