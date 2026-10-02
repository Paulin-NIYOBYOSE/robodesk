import { Check, Play, Send, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { Field, Textarea } from '../../components/ui/Field'
import { useTransitionRequest } from '../../hooks/requests'
import { STATUS_LABEL, transitionLabel } from '../../lib/labels'
import type { RequestDetail, RequestStatus } from '../../types/api'

type PendingAction = 'delivered' | 'accepted' | 'rejected' | null

/**
 * Buttons for the moves the *server* says this user may make (allowed_transitions);
 * the state machine is never duplicated in the browser.
 */
export function RequestActions({ request }: { request: RequestDetail }) {
  const transition = useTransitionRequest(request.id)
  const [pending, setPending] = useState<PendingAction>(null)
  const [reason, setReason] = useState('')
  const shortBy = request.episodes_requested - request.assigned_count
  const clientName = request.client.organisation ?? request.client.name

  function run(to: RequestStatus, comment?: string) {
    transition.mutate(
      { to, comment },
      {
        onSuccess: () => {
          toast.success(`Request moved to ${STATUS_LABEL[to].toLowerCase()}`)
          setPending(null)
          setReason('')
        },
        onError: (error) => toast.error('Could not update the request', { description: error.message }),
      },
    )
  }

  if (request.allowed_transitions.length === 0) return null

  return (
    <>
      {request.allowed_transitions.map((target) => {
        const label = transitionLabel(request.status, target)
        if (target === 'in_progress') {
          return (
            <Button key={target} onClick={() => run(target)} loading={transition.isPending}>
              <Play className="size-4" aria-hidden /> {label}
            </Button>
          )
        }
        if (target === 'delivered') {
          return (
            <Button
              key={target}
              onClick={() => setPending('delivered')}
              disabled={shortBy > 0}
              title={shortBy > 0 ? `Assign ${shortBy} more episode(s) before delivering` : undefined}
            >
              <Send className="size-4" aria-hidden /> {label}
            </Button>
          )
        }
        if (target === 'accepted') {
          return (
            <Button key={target} onClick={() => setPending('accepted')}>
              <Check className="size-4" aria-hidden /> {label}
            </Button>
          )
        }
        return (
          <Button key={target} variant="secondary" onClick={() => setPending('rejected')}>
            <X className="size-4" aria-hidden /> {label}
          </Button>
        )
      })}

      <ConfirmDialog
        open={pending === 'delivered'}
        title="Deliver this request?"
        description={`${request.assigned_count} episodes will be sent to ${clientName} for review. Episodes can't be changed while the client reviews.`}
        confirmLabel="Deliver"
        loading={transition.isPending}
        onConfirm={() => run('delivered')}
        onClose={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending === 'accepted'}
        title="Accept this delivery?"
        description="Accepting closes the request. This can't be undone."
        confirmLabel="Accept delivery"
        loading={transition.isPending}
        onConfirm={() => run('accepted')}
        onClose={() => setPending(null)}
      />
      <ConfirmDialog
        open={pending === 'rejected'}
        title="Reject this delivery?"
        description="The request goes back to the operations team for rework. Tell them what needs to change."
        confirmLabel="Reject delivery"
        tone="danger"
        loading={transition.isPending}
        confirmDisabled={reason.trim().length < 3}
        onConfirm={() => run('rejected', reason.trim())}
        onClose={() => setPending(null)}
      >
        <Field label="Reason" hint="Required — at least a few words.">
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Several clips are out of focus"
            />
          )}
        </Field>
      </ConfirmDialog>
    </>
  )
}
