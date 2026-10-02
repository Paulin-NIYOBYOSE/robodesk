import {
  BarChart3,
  ClipboardList,
  Clapperboard,
  Info,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { Logo } from '../components/Logo'
import { useAuth, useCurrentUser } from '../lib/auth'
import { cn } from '../lib/format'
import { ROLE_LABEL } from '../lib/labels'
import type { Role } from '../types/api'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  roles: Role[]
}

const WORKSPACE: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['client', 'operator', 'admin'] },
  { to: '/requests', label: 'Requests', icon: ClipboardList, roles: ['client', 'operator', 'admin'] },
  { to: '/episodes', label: 'Episodes', icon: Clapperboard, roles: ['operator', 'admin'] },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, roles: ['operator', 'admin'] },
]
const ADMINISTRATION: NavItem[] = [{ to: '/users', label: 'Users', icon: Users, roles: ['admin'] }]

function NavSection({ title, items, onNavigate }: { title: string; items: NavItem[]; onNavigate?: () => void }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{title}</p>
      <div className="space-y-0.5">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand-400" aria-hidden />}
                <Icon
                  className={cn('size-4', isActive ? 'text-brand-300' : 'text-slate-500 group-hover:text-slate-300')}
                  aria-hidden
                />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const user = useCurrentUser()
  const { logout } = useAuth()
  const allowed = (items: NavItem[]) => items.filter((item) => item.roles.includes(user.role))
  const initials = user.name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-300">
      <Link to="/dashboard" onClick={onNavigate} className="px-5 pt-5 pb-6" aria-label="RoboDesk dashboard">
        <Logo tone="light" subtitle="Dataset Operations" />
      </Link>

      {user.role === 'client' && (
        <div className="px-3 pb-5">
          <Link
            to="/requests/new"
            onClick={onNavigate}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm shadow-brand-900/40 transition-colors hover:bg-brand-500"
          >
            <Plus className="size-4" aria-hidden /> New request
          </Link>
        </div>
      )}

      <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3">
        <NavSection title="Workspace" items={allowed(WORKSPACE)} onNavigate={onNavigate} />
        <NavSection title="Administration" items={allowed(ADMINISTRATION)} onNavigate={onNavigate} />
      </nav>

      <div className="space-y-1 border-t border-white/10 p-3">
        <Link
          to="/"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <Info className="size-4 text-slate-500" aria-hidden /> About RoboDesk
        </Link>
        <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
          <div
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-xs font-semibold text-white"
            aria-hidden
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="truncate text-xs text-slate-400">
              {ROLE_LABEL[user.role]}
              {user.organisation && user.organisation !== user.name ? ` · ${user.organisation}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            aria-label="Sign out"
            title="Sign out"
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 bg-slate-950 lg:block">
        <div className="sticky top-0 h-screen">
          <Sidebar />
        </div>
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-800 bg-slate-950 px-4 py-3 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="rounded-md p-1.5 text-slate-300 hover:bg-white/10 hover:text-white"
        >
          <Menu className="size-5" />
        </button>
        <Logo tone="light" />
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-2xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="absolute top-5 right-3 z-10 rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
