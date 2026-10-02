import { Plus, UserX, Users } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card, PageHeader } from '../components/ui/Card'
import { ConfirmDialog, Dialog } from '../components/ui/Dialog'
import { Field, Input, Select } from '../components/ui/Field'
import { EmptyState, ErrorState, TableSkeleton } from '../components/ui/States'
import { Table, Td, Th, Tr } from '../components/ui/Table'
import { useCreateUser, useUpdateUser, useUsers, type NewUser, type UserChanges } from '../hooks/users'
import { useCurrentUser } from '../lib/auth'
import { formatDate } from '../lib/format'
import { ROLE_LABEL } from '../lib/labels'
import { ROLES, type Role, type User } from '../types/api'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface PendingChange {
  user: User
  changes: UserChanges
  title: string
  description: string
  confirmLabel: string
  danger: boolean
}

function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createUser = useCreateUser()
  const empty: NewUser = { email: '', name: '', role: 'client', organisation: '', password: '' }
  const [form, setForm] = useState<NewUser>(empty)
  const [errors, setErrors] = useState<Partial<Record<keyof NewUser, string>>>({})

  const set = <K extends keyof NewUser>(key: K, value: NewUser[K]) => setForm((current) => ({ ...current, [key]: value }))

  function close() {
    setForm(empty)
    setErrors({})
    onClose()
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const found = {
      email: EMAIL_PATTERN.test(form.email.trim()) ? undefined : 'Enter a valid email address',
      name: form.name.trim() ? undefined : 'Enter a name',
      password: form.password.length >= 8 ? undefined : 'Use at least 8 characters',
    }
    setErrors(found)
    if (Object.values(found).some(Boolean)) return
    createUser.mutate(
      { ...form, email: form.email.trim(), organisation: form.organisation?.trim() || null },
      {
        onSuccess: (user) => {
          toast.success(`Created ${user.name}`, { description: `${ROLE_LABEL[user.role]} · ${user.email}` })
          close()
        },
        onError: (error) => toast.error('Could not create the user', { description: error.message }),
      },
    )
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="New user"
      description="The user signs in with this email and password."
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={createUser.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="create-user" loading={createUser.isPending}>
            Create user
          </Button>
        </>
      }
    >
      <form id="create-user" className="space-y-4 pb-1" onSubmit={submit} noValidate>
        <Field label="Name" error={errors.name}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} value={form.name} onChange={(e) => set('name', e.target.value)} aria-describedby={describedBy} aria-invalid={invalid || undefined} />
          )}
        </Field>
        <Field label="Email" error={errors.email}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} type="email" autoComplete="off" value={form.email} onChange={(e) => set('email', e.target.value)} aria-describedby={describedBy} aria-invalid={invalid || undefined} />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role">
            {({ id }) => (
              <Select id={id} value={form.role} onChange={(e) => set('role', e.target.value as Role)}>
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL[role]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Organisation" hint={form.role === 'client' ? 'Shown to operators' : 'Optional'}>
            {({ id, describedBy }) => (
              <Input id={id} value={form.organisation ?? ''} onChange={(e) => set('organisation', e.target.value)} aria-describedby={describedBy} />
            )}
          </Field>
        </div>
        <Field label="Initial password" hint="At least 8 characters. Share it with the user securely." error={errors.password}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} type="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} aria-describedby={describedBy} aria-invalid={invalid || undefined} />
          )}
        </Field>
      </form>
    </Dialog>
  )
}

export function UsersPage() {
  const me = useCurrentUser()
  const users = useUsers()
  const updateUser = useUpdateUser()
  const [creating, setCreating] = useState(false)
  const [pending, setPending] = useState<PendingChange | null>(null)

  function confirmPending() {
    if (!pending) return
    updateUser.mutate(
      { id: pending.user.id, changes: pending.changes },
      {
        onSuccess: (user) => {
          toast.success(`Updated ${user.name}`)
          setPending(null)
        },
        onError: (error) => toast.error('Could not update the user', { description: error.message }),
      },
    )
  }

  function askRoleChange(user: User, role: Role) {
    setPending({
      user,
      changes: { role },
      title: 'Change role?',
      description: `${user.name} will change from ${ROLE_LABEL[user.role]} to ${ROLE_LABEL[role]}. Their permissions change on their next action.`,
      confirmLabel: 'Change role',
      danger: false,
    })
  }

  function askActiveChange(user: User) {
    setPending(
      user.is_active
        ? {
            user,
            changes: { is_active: false },
            title: `Deactivate ${user.name}?`,
            description: 'They are signed out immediately and can no longer sign in. Their requests and history are kept.',
            confirmLabel: 'Deactivate',
            danger: true,
          }
        : {
            user,
            changes: { is_active: true },
            title: `Reactivate ${user.name}?`,
            description: 'They will be able to sign in again with their existing password.',
            confirmLabel: 'Reactivate',
            danger: false,
          },
    )
  }

  return (
    <>
      <PageHeader
        title="Users"
        description="Manage who can access RoboDesk and what they can do."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden /> New user
          </Button>
        }
      />

      <Card>
        {users.isPending ? (
          <TableSkeleton />
        ) : users.isError ? (
          <ErrorState message={users.error.message} onRetry={() => users.refetch()} />
        ) : users.data.length === 0 ? (
          <EmptyState icon={Users} title="No users" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Organisation</Th>
                <Th>Status</Th>
                <Th>Created</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {users.data.map((user) => {
                const isMe = user.id === me.id
                return (
                  <Tr key={user.id} className={user.is_active ? undefined : 'text-slate-400'}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900">{user.name}</span>
                        {isMe && <Badge>You</Badge>}
                      </div>
                      <div className="text-xs text-slate-500">{user.email}</div>
                    </Td>
                    <Td>
                      <label className="sr-only" htmlFor={`role-${user.id}`}>
                        Role for {user.name}
                      </label>
                      <Select
                        id={`role-${user.id}`}
                        className="h-8 w-32 text-[13px]"
                        value={user.role}
                        disabled={isMe}
                        title={isMe ? 'You cannot change your own role' : undefined}
                        onChange={(event) => askRoleChange(user, event.target.value as Role)}
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABEL[role]}
                          </option>
                        ))}
                      </Select>
                    </Td>
                    <Td>{user.organisation ?? <span className="text-slate-400">—</span>}</Td>
                    <Td>
                      {user.is_active ? (
                        <Badge tone="green" dot>
                          Active
                        </Badge>
                      ) : (
                        <Badge dot>Deactivated</Badge>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-500">{formatDate(user.created_at)}</Td>
                    <Td className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isMe}
                        title={isMe ? 'You cannot deactivate your own account' : undefined}
                        className={user.is_active ? 'hover:text-red-600' : undefined}
                        onClick={() => askActiveChange(user)}
                      >
                        {user.is_active && <UserX className="size-4" aria-hidden />}
                        {user.is_active ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <CreateUserDialog open={creating} onClose={() => setCreating(false)} />
      <ConfirmDialog
        open={pending !== null}
        title={pending?.title ?? ''}
        description={pending?.description ?? ''}
        confirmLabel={pending?.confirmLabel ?? 'Confirm'}
        tone={pending?.danger ? 'danger' : 'primary'}
        loading={updateUser.isPending}
        onConfirm={confirmPending}
        onClose={() => setPending(null)}
      />
    </>
  )
}
