import { Clapperboard, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { QualityBadge } from '../../components/Badges'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { Pagination } from '../../components/ui/Pagination'
import { EmptyState, ErrorState, TableSkeleton } from '../../components/ui/States'
import { Table, Td, Th, Tr } from '../../components/ui/Table'
import { useAssignments, useUnassignEpisode } from '../../hooks/requests'
import { cn, formatClipLength, formatDateTime } from '../../lib/format'
import type { RequestDetail } from '../../types/api'

const PAGE_SIZE = 10

export function AssignedEpisodes({ request, editable }: { request: RequestDetail; editable: boolean }) {
  const [page, setPage] = useState(1)
  const assignments = useAssignments(request.id, page, PAGE_SIZE)
  const unassign = useUnassignEpisode(request.id)

  function remove(episodeId: number, label: string) {
    unassign.mutate(episodeId, {
      onSuccess: () => toast.success(`Removed ${label} from this request`),
      onError: (error) => toast.error('Could not remove the episode', { description: error.message }),
    })
  }

  return (
    <Card>
      <CardHeader
        title="Assigned episodes"
        description={editable ? 'Episodes can be removed while the request is in progress.' : undefined}
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
                <Th>Robot</Th>
                <Th>Recorded</Th>
                <Th>Length</Th>
                <Th>Quality</Th>
                <Th>Assigned by</Th>
                {editable && <Th className="w-0" aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {assignments.data.items.map(({ episode, assigned_by, assigned_at }) => (
                <Tr key={episode.id}>
                  <Td className="font-mono text-[13px] whitespace-nowrap text-zinc-900">{episode.episode_id}</Td>
                  <Td className="whitespace-nowrap">{episode.robot_id}</Td>
                  <Td className="whitespace-nowrap">{formatDateTime(episode.recorded_at)}</Td>
                  <Td className="tabular whitespace-nowrap">{formatClipLength(episode.duration_seconds)}</Td>
                  <Td>
                    <QualityBadge quality={episode.quality} />
                  </Td>
                  <Td className="whitespace-nowrap text-zinc-500">
                    {assigned_by.name}
                    <div className="text-xs">{formatDateTime(assigned_at)}</div>
                  </Td>
                  {editable && (
                    <Td>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-2 text-zinc-500 hover:text-red-600"
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
              ))}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={assignments.data.total} onPageChange={setPage} />
        </div>
      )}
    </Card>
  )
}
