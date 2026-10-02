import { createContext, useContext } from 'react'
import type { User } from '../types/api'

export type AuthState =
  | { status: 'loading' }
  // `reason` is set when a session just ended: expired (token rejected) or signed out on purpose.
  | { status: 'anonymous'; reason?: 'expired' | 'signed_out' }
  | { status: 'authenticated'; user: User }

export interface AuthContextValue {
  state: AuthState
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}

/** The signed-in user. Only call this below <RequireAuth>. */
export function useCurrentUser(): User {
  const { state } = useAuth()
  if (state.status !== 'authenticated') throw new Error('useCurrentUser called without a signed-in user')
  return state.user
}

export const isStaff = (user: Pick<User, 'role'>) => user.role === 'operator' || user.role === 'admin'
