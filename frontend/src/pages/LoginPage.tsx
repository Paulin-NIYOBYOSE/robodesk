import { AlertCircle, ArrowLeft, Check, Info } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { Logo } from '../components/Logo'
import { Button } from '../components/ui/Button'
import { Field, Input } from '../components/ui/Field'
import { ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const HIGHLIGHTS = [
  'Clients request datasets and review deliveries',
  'Operators assign recorded episodes, with rules enforced by the server',
  'Every status change is audited: who, when and why',
]

export function LoginPage() {
  const { state, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/dashboard'
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
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col">
        <div className="bg-grid-dark absolute inset-0 [mask-image:radial-gradient(ellipse_at_top_left,black_30%,transparent_80%)]" aria-hidden />
        <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-brand-600/30 blur-3xl" aria-hidden />
        <Link to="/" className="relative" aria-label="RoboDesk home">
          <Logo tone="light" subtitle="Dataset Operations" />
        </Link>
        <div className="relative my-auto max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight">Robotics Dataset Request &amp; Operations Platform</h1>
          <ul className="mt-8 space-y-4">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex gap-3 text-slate-300">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-brand-300">
                  <Check className="size-3.5" aria-hidden />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-slate-500">Internal tool. Access is managed by your administrator.</p>
      </div>

      {/* Form */}
      <div className="flex flex-col bg-white px-4 py-8 sm:px-10">
        <Link to="/" className="inline-flex items-center gap-1.5 self-start text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="size-4" aria-hidden /> Back to home
        </Link>
        <div className="mx-auto my-auto w-full max-w-sm py-10">
          <div className="mb-8 lg:hidden">
            <Logo subtitle="Robotics Dataset Request & Operations Platform" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in to RoboDesk</h2>
          <p className="mt-2 text-sm text-slate-500">Use the account provided by your RoboDesk administrator.</p>

          {state.status === 'anonymous' && state.reason === 'expired' && !error && (
            <div className="mt-6 flex gap-2 rounded-lg bg-blue-50 px-3 py-2.5 text-sm text-blue-800" role="status">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              Your session has ended. Please sign in again.
            </div>
          )}
          {error && (
            <div className="mt-6 flex gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </div>
          )}

          <form className="mt-6 space-y-5" onSubmit={handleSubmit} noValidate>
            <Field label="Email" error={fieldErrors.email}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  type="email"
                  autoComplete="username"
                  autoFocus
                  className="h-10"
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
                  className="h-10"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                />
              )}
            </Field>
            <Button type="submit" className="h-10 w-full" loading={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
