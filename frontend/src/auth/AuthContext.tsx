import axios from 'axios'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import API from '../api'

export type User = {
  id: string
  name: string
  email: string
}

type AuthResponse = {
  user: User
}

type AuthStatus = 'loading' | 'ready' | 'error'

type AuthContextValue = {
  user: User | null
  status: AuthStatus
  error: string | null
  refresh: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function getErrorMessage(error: unknown, fallback: string): string {
  if (
    axios.isAxiosError<{ message?: string }>(error) &&
    typeof error.response?.data?.message === 'string'
  ) {
    return error.response.data.message
  }

  return fallback
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setStatus('loading')
    setError(null)

    try {
      const response = await API.get<AuthResponse>('/auth/me')
      setUser(response.data.user)
      setStatus('ready')
    } catch (requestError) {
      if (axios.isAxiosError(requestError) && requestError.response?.status === 401) {
        setUser(null)
        setStatus('ready')
        return
      }

      setUser(null)
      setError(getErrorMessage(requestError, 'Could not verify your session.'))
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    const response = await API.post<AuthResponse>('/auth/login', { email, password })
    setUser(response.data.user)
    setStatus('ready')
    setError(null)
  }, [])

  const register = useCallback(async (name: string, email: string, password: string) => {
    const response = await API.post<AuthResponse>('/auth/register', { name, email, password })
    setUser(response.data.user)
    setStatus('ready')
    setError(null)
  }, [])

  const logout = useCallback(async () => {
    await API.post('/auth/logout')
    setUser(null)
    setStatus('ready')
    setError(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, status, error, refresh, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}
