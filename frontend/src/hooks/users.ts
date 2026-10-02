import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Role, User } from '../types/api'

export interface NewUser {
  email: string
  name: string
  role: Role
  organisation: string | null
  password: string
}

export type UserChanges = Partial<Pick<User, 'name' | 'role' | 'organisation' | 'is_active'>>

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: ({ signal }) => api<User[]>('/users', { signal }),
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: NewUser) => api<User>('/users', { method: 'POST', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: UserChanges }) =>
      api<User>(`/users/${id}`, { method: 'PATCH', body: changes }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['users'] }),
        queryClient.invalidateQueries({ queryKey: ['clients'] }),
      ]),
  })
}
