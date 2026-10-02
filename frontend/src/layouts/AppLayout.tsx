import { BarChart3, ClipboardList, Clapperboard, LayoutDashboard, LogOut, Menu, Users, X, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { LogoMark } from '../components/Logo'
import { Button } from '../components/ui/Button'
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

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['client', 'operator', 'admin'] },
  { to: '/requests', label: 'Requests', icon: ClipboardList, roles: ['client', 'operator', 'admin'] },
  { to: '/episodes', label: 'Episodes', icon: Clapperboard, roles: ['operator', 'admin'] },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, roles: ['operator', 'admin'] },
  { to: '/users', label: 'Users', icon: Users, roles: ['admin'] },
]

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const user = useCurrentUser()
  const { logout } = useAuth()
  const items = NAV.filter((item) => item.roles.includes(user.role))

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <LogoMark />
        <div className="leading-tight">
          <p className="text-[15px] font-semibold tracking-tight text-zinc-900">RoboDesk</p>
          <p className="text-[11px] text-zinc-500">Dataset Operations</p>
        </div>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-0.5 px-3">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-brand-50 text-brand-700' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
              )
            }
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-zinc-200 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold text-zinc-700"
            aria-hidden
          >
            {user.name
              .split(' ')
              .map((part) => part[0])
              .slice(0, 2)
              .join('')}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-zinc-900">{user.name}</p>
            <p className="truncate text-xs text-zinc-500">
              {ROLE_LABEL[user.role]}
              {user.organisation ? ` · ${user.organisation}` : ''}
            </p>
          </div>
          <Button variant="ghost" size="sm" className="px-2" onClick={logout} aria-label="Sign out" title="Sign out">
            <LogOut className="size-4" />
          </Button>
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
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-zinc-200 bg-white lg:block">
        <Sidebar />
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        <Button variant="ghost" size="sm" className="px-2" onClick={() => setMobileOpen(true)} aria-label="Open menu">
          <Menu className="size-5" />
        </Button>
        <LogoMark className="size-7" />
        <span className="font-semibold tracking-tight">RoboDesk</span>
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-zinc-950/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-4 right-3 px-2"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X className="size-4" />
            </Button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
