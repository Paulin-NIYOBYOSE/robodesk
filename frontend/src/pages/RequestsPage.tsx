import { ClipboardList, Plus, Search } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { StatusBadge } from '../components/Badges'
import { Button } from '../components/ui/Button'
import { buttonStyles } from '../components/ui/buttonStyles'
import { Card, PageHeader } from '../components/ui/Card'
import { Input, Select } from '../components/ui/Field'
import { Pagination } from '../components/ui/Pagination'
import { Progress } from '../components/ui/Progress'
import { EmptyState, ErrorState, TableSkeleton } from '../components/ui/States'
import { Table, Td, Th, Tr } from '../components/ui/Table'
import { useClients, useRequests, type RequestListFilters } from '../hooks/requests'
import { isStaff, useCurrentUser } from '../lib/auth'
import { cn, formatDate, isOverdue } from '../lib/format'
import { STATUS_LABEL } from '../lib/labels'
import { REQUEST_STATUSES, type RequestStatus } from '../types/api'

const PAGE_SIZE = 20

export function RequestsPage() {
  const user = useCurrentUser()
  const staff = isStaff(user)
  const [params, setParams] = useSearchParams()

  const filters: RequestListFilters = {
    status: (params.get('status') ?? '') as RequestStatus | '',
    task_name: params.get('task') ?? '',
    client_id: params.get('client') ?? '',
    deadline_before: params.get('due') ?? '',
    sort: params.get('sort') === 'deadline' ? 'deadline' : 'newest',
    page: Math.max(1, Number(params.get('page')) || 1),
    page_size: PAGE_SIZE,
  }
  const hasFilters = Boolean(filters.status || filters.task_name || filters.client_id || filters.deadline_before)

  /** Change URL filters; any filter change goes back to page 1. */
  const update = (changes: Record<string, string>) => {
    setParams((current) => {
      const next = new URLSearchParams(current)
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      if (!('page' in changes)) next.delete('page')
      return next
    })
  }

  // Type freely; the URL (and so the query) follows once typing pauses.
  const [taskInput, setTaskInput] = useState(filters.task_name ?? '')
  const taskTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  function changeTask(value: string) {
    setTaskInput(value)
    clearTimeout(taskTimer.current)
    taskTimer.current = setTimeout(() => update({ task: value }), 300)
  }

  const requests = useRequests(filters)
  const clients = useClients(staff)

  return (
    <>
      <PageHeader
        title={staff ? 'Requests' : 'My requests'}
        description={
          staff ? 'Every dataset request across all clients.' : 'Track your dataset requests and review deliveries.'
        }
        actions={
          user.role === 'client' && (
            <Link to="/requests/new" className={buttonStyles()}>
              <Plus className="size-4" aria-hidden /> New request
            </Link>
          )
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-zinc-100 px-5 py-4">
          <label className="relative min-w-48 flex-1 sm:max-w-64">
            <span className="sr-only">Search by task</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
            <Input
              className="pl-9"
              placeholder="Search task…"
              value={taskInput}
              onChange={(event) => changeTask(event.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">Status</span>
            <Select value={filters.status} onChange={(event) => update({ status: event.target.value })}>
              <option value="">All statuses</option>
              {REQUEST_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ))}
            </Select>
          </label>
          {staff && (
            <label>
              <span className="sr-only">Client</span>
              <Select value={filters.client_id} onChange={(event) => update({ client: event.target.value })}>
                <option value="">All clients</option>
                {clients.data?.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.organisation ?? client.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            <span className="whitespace-nowrap">Due by</span>
            <Input
              type="date"
              className="w-40"
              value={filters.deadline_before}
              onChange={(event) => update({ due: event.target.value })}
            />
          </label>
          <label>
            <span className="sr-only">Sort</span>
            <Select value={filters.sort} onChange={(event) => update({ sort: event.target.value === 'deadline' ? 'deadline' : '' })}>
              <option value="newest">Newest first</option>
              <option value="deadline">Deadline soonest</option>
            </Select>
          </label>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="mb-0.5"
              onClick={() => {
                clearTimeout(taskTimer.current)
                setTaskInput('')
                setParams({})
              }}
            >
              Clear filters
            </Button>
          )}
        </div>

        {requests.isPending ? (
          <TableSkeleton />
        ) : requests.isError ? (
          <ErrorState message={requests.error.message} onRetry={() => requests.refetch()} />
        ) : requests.data.items.length === 0 ? (
          hasFilters ? (
            <EmptyState icon={Search} title="No requests match these filters" description="Try widening your search." />
          ) : (
            <EmptyState
              icon={ClipboardList}
              title="No requests yet"
              description={
                staff
                  ? 'Requests submitted by clients will appear here.'
                  : 'Describe the dataset you need and our operators will start collecting it.'
              }
              action={
                user.role === 'client' && (
                  <Link to="/requests/new" className={buttonStyles()}>
                    <Plus className="size-4" aria-hidden /> New request
                  </Link>
                )
              }
            />
          )
        ) : (
          <div className={cn('transition-opacity', requests.isPlaceholderData && 'opacity-60')}>
            <Table>
              <thead>
                <tr>
                  <Th>Request</Th>
                  {staff && <Th>Client</Th>}
                  <Th className="min-w-40">Progress</Th>
                  <Th>Deadline</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {requests.data.items.map((request) => {
                  const overdue = isOverdue(request.deadline, request.status)
                  return (
                    <Tr key={request.id}>
                      <Td>
                        <Link
                          to={`/requests/${request.id}`}
                          className="font-medium text-zinc-900 hover:text-brand-700 hover:underline"
                        >
                          {request.task_name}
                        </Link>
                        <div className="text-xs text-zinc-500">#{request.id}</div>
                      </Td>
                      {staff && <Td>{request.client.organisation ?? request.client.name}</Td>}
                      <Td>
                        <div className="tabular mb-1 text-xs text-zinc-600">
                          {request.assigned_count} / {request.episodes_requested}
                        </div>
                        <Progress value={request.assigned_count} max={request.episodes_requested} />
                      </Td>
                      <Td className="whitespace-nowrap">
                        <span className={cn(overdue && 'font-medium text-red-600')}>{formatDate(request.deadline)}</span>
                        {overdue && <div className="text-xs text-red-600">Overdue</div>}
                      </Td>
                      <Td>
                        <StatusBadge status={request.status} />
                      </Td>
                      <Td className="whitespace-nowrap text-zinc-500">{formatDate(request.created_at)}</Td>
                    </Tr>
                  )
                })}
              </tbody>
            </Table>
            <Pagination
              page={requests.data.page}
              pageSize={PAGE_SIZE}
              total={requests.data.total}
              onPageChange={(page) => update({ page: String(page) })}
            />
          </div>
        )}
      </Card>
    </>
  )
}
