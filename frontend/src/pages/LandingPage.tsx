import {
  ArrowRight,
  ClipboardList,
  Database,
  FileCheck2,
  Gauge,
  Layers,
  LockKeyhole,
  RefreshCcw,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router'
import { Logo } from '../components/Logo'
import { buttonStyles } from '../components/ui/buttonStyles'
import { useAuth } from '../lib/auth'
import { cn } from '../lib/format'
import { ImportExplorer } from './landing/ImportExplorer'
import { RequestPreview } from './landing/RequestPreview'
import { WorkflowExplorer } from './landing/WorkflowExplorer'

const SECTIONS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#workflow', label: 'Workflow' },
  { href: '#import', label: 'Data import' },
  { href: '#engineering', label: 'Engineering' },
]

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: ClipboardList,
    title: 'Clients request datasets',
    text: '“200 episodes of a robot arm picking cups by 30 October.” Each client sees only their own requests and their status.',
  },
  {
    icon: Layers,
    title: 'Operators assign episodes',
    text: 'Filter recorded episodes by task, quality and robot. Only good or usable episodes can be assigned, each to one request at most.',
  },
  {
    icon: FileCheck2,
    title: 'Clients review the delivery',
    text: 'Accept it, or reject it with a reason that sends it back for rework. Every step is recorded with who did it and when.',
  },
]

const ENGINEERING: { icon: LucideIcon; value: string; label: string; text: string }[] = [
  {
    icon: ShieldCheck,
    value: 'Server-side',
    label: 'role-based access',
    text: 'Every rule is enforced by the API. Clients get 404 for other clients’ requests.',
  },
  {
    icon: Database,
    value: '1.2 s',
    label: 'a year of analytics over 5M episodes',
    text: 'Aggregated in PostgreSQL with index-only scans, measured on a laptop.',
  },
  {
    icon: RefreshCcw,
    value: 'Idempotent',
    label: 'CSV import',
    text: 'Re-running an import never duplicates or overwrites, and every skipped row is explained.',
  },
  {
    icon: LockKeyhole,
    value: 'Race-safe',
    label: 'assignments',
    text: 'A database constraint guarantees one request per episode, even when two operators click at once.',
  },
  {
    icon: Gauge,
    value: 'Background',
    label: 'exports with retries',
    text: 'Each assigned episode is exported by a worker that retries failures and survives crashes.',
  },
  {
    icon: Users,
    value: '200+',
    label: 'automated tests',
    text: 'Authorization, every status transition, assignment rules, import edge cases and analytics.',
  },
]

function PrimaryCta({ className }: { className?: string }) {
  const { state } = useAuth()
  const signedIn = state.status === 'authenticated'
  return (
    <Link to={signedIn ? '/dashboard' : '/login'} className={buttonStyles('primary', 'md', cn('h-10 px-4', className))}>
      {signedIn ? 'Open dashboard' : 'Sign in'} <ArrowRight className="size-4" aria-hidden />
    </Link>
  )
}

function SectionHeading({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      <p className="text-xs font-semibold tracking-wider text-brand-600 uppercase">{eyebrow}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{title}</h2>
      <p className="mt-3 text-base leading-relaxed text-slate-600">{text}</p>
    </div>
  )
}

export function LandingPage() {
  return (
    <div className="bg-white">
      {/* Navigation */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="RoboDesk home">
            <Logo tone="light" />
          </Link>
          <nav aria-label="Sections" className="hidden items-center gap-6 md:flex">
            {SECTIONS.map((section) => (
              <a key={section.href} href={section.href} className="text-sm text-slate-300 transition-colors hover:text-white">
                {section.label}
              </a>
            ))}
          </nav>
          <PrimaryCta className="h-9" />
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="bg-grid-dark absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" aria-hidden />
        <div className="absolute -top-40 left-1/2 h-96 w-[48rem] -translate-x-1/2 rounded-full bg-brand-600/25 blur-3xl" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div className="animate-fade-up">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
              <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden /> Internal operations platform
            </p>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl lg:text-[3.4rem] lg:leading-[1.08]">
              Robot datasets, from <span className="text-brand-300">request</span> to{' '}
              <span className="text-brand-300">accepted delivery</span>.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-300">
              RoboDesk replaces the spreadsheet. Clients request teleoperation datasets, operators fulfil them with
              recorded episodes, and every step is tracked, audited and enforced by the server.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <PrimaryCta />
              <a
                href="#workflow"
                className="inline-flex h-10 items-center rounded-lg border border-white/15 px-4 text-sm font-medium text-white transition-colors hover:bg-white/10"
              >
                Explore the workflow
              </a>
            </div>
            <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-400">
              {['Role-based access', 'Audited workflow', 'Idempotent imports', 'Live export status'].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="size-1 rounded-full bg-brand-400" aria-hidden /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="animate-fade-up [animation-delay:120ms]">
            <RequestPreview />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-16 bg-white px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="How it works"
            title="Three roles, one shared source of truth"
            text="The same request moves between clients and the operations team. Nothing lives in a spreadsheet tab or an email thread."
          />
          <ol className="grid gap-5 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, index) => (
              <li key={title} className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="text-sm font-semibold text-slate-300">0{index + 1}</span>
                </div>
                <h3 className="mt-5 text-base font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Workflow explorer */}
      <section id="workflow" className="scroll-mt-16 bg-slate-50 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Workflow"
            title="Every move belongs to one role"
            text="Choose a role to see which transitions it may make. A request can't be delivered until it has all the episodes it asked for, and a rejection always comes with a reason."
          />
          <WorkflowExplorer />
        </div>
      </section>

      {/* Import explorer */}
      <section id="import" className="scroll-mt-16 bg-white px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Data import"
            title="Messy exports in, a clear report out"
            text="The recording system's CSV has duplicates, blanks, odd casing and mixed date formats. Click a row from the real export to see what RoboDesk does with it."
          />
          <ImportExplorer />
        </div>
      </section>

      {/* Engineering */}
      <section id="engineering" className="scroll-mt-16 bg-slate-50 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <SectionHeading
            eyebrow="Engineering"
            title="Small, solid and measured"
            text="Correctness first: the rules live on the server and are backed by the database, and the numbers below were measured, not estimated."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ENGINEERING.map(({ icon: Icon, value, label, text }) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
                <Icon className="size-5 text-brand-600" aria-hidden />
                <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
                <p className="text-sm font-medium text-slate-700">{label}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Call to action */}
      <section className="px-4 py-20 sm:px-6">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-slate-950 px-6 py-14 text-center text-white sm:px-12">
          <div className="bg-grid-dark absolute inset-0 opacity-60" aria-hidden />
          <div className="absolute -bottom-32 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-brand-600/30 blur-3xl" aria-hidden />
          <div className="relative">
            <h2 className="text-3xl font-semibold tracking-tight">See it with real data</h2>
            <p className="mx-auto mt-3 max-w-xl text-slate-300">
              Sign in with one of the seeded test accounts listed in the README. Try a client, an operator and an
              admin to see how each role's view and permissions differ.
            </p>
            <div className="mt-8 flex justify-center">
              <PrimaryCta />
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 text-sm text-slate-500">
          <Logo subtitle="Robotics Dataset Request & Operations Platform" />
          <p>Internal tool · FastAPI, PostgreSQL and React</p>
        </div>
      </footer>
    </div>
  )
}
