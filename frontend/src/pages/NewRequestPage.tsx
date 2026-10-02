import { ArrowLeft } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '../components/ui/Button'
import { buttonStyles } from '../components/ui/buttonStyles'
import { Card, PageHeader } from '../components/ui/Card'
import { Field, Input, Textarea } from '../components/ui/Field'
import { useCreateRequest } from '../hooks/requests'
import { isoDate } from '../lib/format'

const MAX_EPISODES = 10_000

interface FormErrors {
  task_name?: string
  episodes_requested?: string
  deadline?: string
}

export function NewRequestPage() {
  const navigate = useNavigate()
  const createRequest = useCreateRequest()
  const [today] = useState(() => isoDate(new Date()))
  const [taskName, setTaskName] = useState('')
  const [episodes, setEpisodes] = useState('')
  const [deadline, setDeadline] = useState('')
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})

  function validate(): FormErrors {
    const count = Number(episodes)
    return {
      task_name: taskName.trim() ? undefined : 'Describe the task the robot should perform',
      episodes_requested:
        Number.isInteger(count) && count >= 1 && count <= MAX_EPISODES
          ? undefined
          : `Enter a whole number between 1 and ${MAX_EPISODES.toLocaleString()}`,
      deadline: !deadline ? 'Choose a deadline' : deadline < today ? 'The deadline cannot be in the past' : undefined,
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const found = validate()
    setErrors(found)
    if (Object.values(found).some(Boolean)) return

    createRequest.mutate(
      { task_name: taskName, episodes_requested: Number(episodes), deadline, notes: notes.trim() || null },
      {
        onSuccess: (request) => {
          toast.success('Request submitted', { description: `Request #${request.id} is waiting for an operator.` })
          navigate(`/requests/${request.id}`)
        },
        onError: (error) => toast.error('Could not submit the request', { description: error.message }),
      },
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/requests" className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="size-4" aria-hidden /> Back to requests
      </Link>
      <PageHeader title="New dataset request" description="Tell us what you need; an operator will pick it up." />

      <Card>
        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-5 p-5 sm:p-6">
            <Field
              label="Task"
              hint='What the robot should be doing, e.g. "pick cup" or "fold towel".'
              error={errors.task_name}
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  maxLength={200}
                  value={taskName}
                  onChange={(event) => setTaskName(event.target.value)}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                />
              )}
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Number of episodes" error={errors.episodes_requested}>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_EPISODES}
                    step={1}
                    value={episodes}
                    onChange={(event) => setEpisodes(event.target.value)}
                    aria-describedby={describedBy}
                    aria-invalid={invalid || undefined}
                  />
                )}
              </Field>
              <Field label="Deadline" error={errors.deadline}>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    type="date"
                    min={today}
                    value={deadline}
                    onChange={(event) => setDeadline(event.target.value)}
                    aria-describedby={describedBy}
                    aria-invalid={invalid || undefined}
                  />
                )}
              </Field>
            </div>

            <Field label="Notes (optional)" hint="Lighting, objects, robot preferences — anything operators should know.">
              {({ id, describedBy }) => (
                <Textarea
                  id={id}
                  maxLength={2000}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  aria-describedby={describedBy}
                />
              )}
            </Field>
          </div>

          <div className="flex justify-end gap-2 border-t border-zinc-100 px-5 py-4 sm:px-6">
            <Link to="/requests" className={buttonStyles('secondary')}>
              Cancel
            </Link>
            <Button type="submit" loading={createRequest.isPending}>
              Submit request
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
