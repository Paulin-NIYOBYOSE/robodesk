import { AlertCircle, Info } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { LogoMark } from '../components/Logo'
import { Button } from '../components/ui/Button'
import { Field, Input } from '../components/ui/Field'
import { ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function LoginPage() {
  const { state, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/'
  if (state.status === 'authenticated') return <Navigate to={redirectTo} replace />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const errors = {
      email: EMAIL_PATTERN.test(email.trim()) ? undefined : 'Enter a valid email address',
      password: password ? undefined : 'Enter your password',
    }
    setFieldErrors(errors)
    if (errors.email || errors.password) return

    setSubmitting(true)
    setError(null)
    try {
      await login(email.trim(), password)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed. Please try again.')
      setPassword('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark className="size-11" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-900">RoboDesk</h1>
          <p className="mt-1 text-sm text-zinc-500">Robotics Dataset Request &amp; Operations Platform</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-zinc-900">Sign in</h2>
          <p className="mt-1 text-sm text-zinc-500">Use the account provided by your RoboDesk administrator.</p>

          {state.status === 'anonymous' && state.reason === 'expired' && !error && (
            <div className="mt-4 flex gap-2 rounded-lg bg-blue-50 px-3 py-2.5 text-sm text-blue-800" role="status">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              Your session has ended. Please sign in again.
            </div>
          )}
          {error && (
            <div className="mt-4 flex gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </div>
          )}

          <form className="mt-5 space-y-4" onSubmit={handleSubmit} noValidate>
            <Field label="Email" error={fieldErrors.email}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  type="email"
                  autoComplete="username"
                  autoFocus
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  placeholder="you@company.com"
                />
              )}
            </Field>
            <Field label="Password" error={fieldErrors.password}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                />
              )}
            </Field>
            <Button type="submit" className="w-full" loading={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
