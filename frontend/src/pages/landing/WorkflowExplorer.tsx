import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../lib/format'
import { ROLE_LABEL, STATUS_LABEL } from '../../lib/labels'
import type { RequestStatus, Role } from '../../types/api'

interface Edge {
  label: string
  roles: Role[]
  path: string
  labelAt: [number, number]
}

// An illustration of backend/app/services/workflow.py — the API enforces the real rules.
const NODES: Record<RequestStatus, [number, number]> = {
  submitted: [10, 30],
  in_progress: [220, 30],
  delivered: [430, 30],
  accepted: [640, 30],
  rejected: [430, 150],
}
const NODE_W = 120
const NODE_H = 44
const STAFF: Role[] = ['operator', 'admin']

const EDGES: Edge[] = [
  { label: 'Start work', roles: STAFF, path: 'M130 52 H 214', labelAt: [175, 42] },
  { label: 'Deliver', roles: STAFF, path: 'M340 52 H 424', labelAt: [385, 42] },
  { label: 'Accept', roles: ['client'], path: 'M550 52 H 634', labelAt: [595, 42] },
  { label: 'Reject', roles: ['client'], path: 'M490 74 V 144', labelAt: [522, 113] },
  { label: 'Rework', roles: STAFF, path: 'M430 172 H 280 V 80', labelAt: [355, 164] },
]

const CAN_DO: Record<Role, { allowed: string[]; denied: string[] }> = {
  client: {
    allowed: [
      'Create dataset requests',
      'See only their own requests (anyone else’s id answers 404)',
      'Review the delivered episodes, then accept or reject (a reason is required)',
    ],
    denied: ['Change operational status', 'Assign or import episodes', 'Manage users'],
  },
  operator: {
    allowed: [
      'See every request and move it through the workflow',
      'Assign good or usable episodes while a request is in progress',
      'Deliver once enough episodes are assigned',
      'Import episode CSVs and read analytics',
    ],
    denied: ['Accept or reject on a client’s behalf', 'Manage users or roles'],
  },
  admin: {
    allowed: ['Everything an operator can do', 'Create users, change roles, deactivate accounts'],
    denied: ['Accept or reject on a client’s behalf', 'Demote or deactivate themselves'],
  },
}

export function WorkflowExplorer() {
  const [role, setRole] = useState<Role>('operator')
  const { allowed, denied } = CAN_DO[role]

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
        <p className="text-sm font-medium text-slate-700">View the workflow as…</p>
        <div className="inline-flex rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Role">
          {(['client', 'operator', 'admin'] as Role[]).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={role === option}
              onClick={() => setRole(option)}
              className={cn(
                'rounded-md px-3.5 py-1.5 text-sm font-medium transition-all',
                role === option ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              {ROLE_LABEL[option]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1fr_320px]">
        <div className="overflow-x-auto p-5 sm:p-6">
          <svg
            viewBox="0 0 770 210"
            className="min-w-[640px]"
            role="img"
            aria-label={`Request workflow; transitions available to a ${ROLE_LABEL[role].toLowerCase()} are highlighted`}
          >
            <defs>
              {(['on', 'off'] as const).map((state) => (
                <marker
                  key={state}
                  id={`arrow-${state}`}
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M0 0 L10 5 L0 10 z" fill={state === 'on' ? '#4f46e5' : '#cbd5e1'} />
                </marker>
              ))}
            </defs>
            {EDGES.map((edge) => {
              const on = edge.roles.includes(role)
              return (
                <g key={edge.label} className="transition-opacity">
                  <path
                    d={edge.path}
                    fill="none"
                    stroke={on ? '#4f46e5' : '#cbd5e1'}
                    strokeWidth={on ? 2.5 : 1.5}
                    strokeDasharray={on ? undefined : '4 4'}
                    markerEnd={`url(#arrow-${on ? 'on' : 'off'})`}
                  />
                  <text
                    x={edge.labelAt[0]}
                    y={edge.labelAt[1]}
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight={on ? 600 : 400}
                    fill={on ? '#4338ca' : '#94a3b8'}
                  >
                    {edge.label}
                  </text>
                </g>
              )
            })}
            {(Object.entries(NODES) as [RequestStatus, [number, number]][]).map(([status, [x, y]]) => (
              <g key={status}>
                <rect x={x} y={y} width={NODE_W} height={NODE_H} rx="10" fill="#ffffff" stroke="#e2e8f0" strokeWidth="1.5" />
                <text x={x + NODE_W / 2} y={y + 27} textAnchor="middle" fontSize="13" fontWeight="600" fill="#0f172a">
                  {STATUS_LABEL[status]}
                </text>
              </g>
            ))}
          </svg>
        </div>

        <div className="border-t border-slate-100 bg-slate-50/60 p-5 sm:p-6 lg:border-t-0 lg:border-l">
          <p className="text-sm font-semibold text-slate-900">
            {role === 'client' ? 'A' : 'An'} {ROLE_LABEL[role].toLowerCase()} can
          </p>
          <ul className="mt-3 space-y-2">
            {allowed.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-slate-700">
                <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden /> {item}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm font-semibold text-slate-900">…and the API refuses to let them</p>
          <ul className="mt-3 space-y-2">
            {denied.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-slate-500">
                <X className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden /> {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
