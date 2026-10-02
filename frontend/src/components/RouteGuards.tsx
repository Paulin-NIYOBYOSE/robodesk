import { Loader2, ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { useAuth } from '../lib/auth'
import type { Role } from '../types/api'
import { EmptyState } from './ui/States'

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading">
      <Loader2 className="size-6 animate-spin text-zinc-400" />
    </div>
  )
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const location = useLocation()
  if (state.status === 'loading') return <FullPageSpinner />
  if (state.status === 'anonymous') {
    // Come back here after signing in, unless this user just signed out on purpose
    // (the next person to sign in should start on their own dashboard).
    const from = state.reason === 'signed_out' ? undefined : location.pathname + location.search
    return <Navigate to="/login" replace state={{ from }} />
  }
  return children
}

/**
 * Hides pages from roles that cannot use them. This is a convenience only: the API
 * enforces every permission itself and would answer 403 anyway.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { state } = useAuth()
  if (state.status !== 'authenticated' || !roles.includes(state.user.role)) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="You don't have access to this page"
        description="Ask an administrator if you think you should."
        action={
          <Link to="/" className="text-sm font-medium text-brand-600 hover:text-brand-700">
            Back to dashboard
          </Link>
        }
      />
    )
  }
  return children
}
