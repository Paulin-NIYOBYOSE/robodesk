import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, setUnauthorizedHandler, tokenStore } from '../lib/api'
import { AuthContext, type AuthState } from '../lib/auth'
import type { TokenResponse, User } from '../types/api'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<AuthState>(() =>
    tokenStore.get() ? { status: 'loading' } : { status: 'anonymous' },
  )

  const endSession = useCallback(
    (reason?: 'expired' | 'signed_out') => {
      tokenStore.clear()
      queryClient.clear() // never show one user's cached data to the next
      setState({ status: 'anonymous', reason })
    },
    [queryClient],
  )

  // Any 401 from the API (expired token, deactivated account) ends the session.
  useEffect(() => {
    setUnauthorizedHandler(() => endSession('expired'))
    return () => setUnauthorizedHandler(null)
  }, [endSession])

  // On page load, confirm a stored token is still valid and who it belongs to.
  useEffect(() => {
    if (state.status !== 'loading') return
    const controller = new AbortController()
    api<User>('/auth/me', { signal: controller.signal })
      .then((user) => setState({ status: 'authenticated', user }))
      .catch((error: Error) => {
        if (error.name !== 'AbortError') endSession()
      })
    return () => controller.abort()
  }, [state.status, endSession])

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api<TokenResponse>('/auth/login', { method: 'POST', body: { email, password } })
      tokenStore.set(result.access_token)
      queryClient.clear()
      setState({ status: 'authenticated', user: result.user })
    },
    [queryClient],
  )

  const logout = useCallback(() => endSession('signed_out'), [endSession])
  const value = useMemo(() => ({ state, login, logout }), [state, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
