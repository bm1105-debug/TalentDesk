import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import api from '@/api/client'

// Shape of the logged-in user (matches /api/users/me/ response)
export interface AuthUser {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  role: string
}

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean          // true while we're checking localStorage on first load
  login: (username: string, password: string) => Promise<AuthUser>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,      setUser]      = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Fetch the current user's profile from the API
  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get<AuthUser>('/users/me/')
      setUser(data)
    } catch {
      // Token was invalid or expired beyond refresh — clear everything
      localStorage.removeItem('access')
      localStorage.removeItem('refresh')
      setUser(null)
    }
  }, [])

  // On first mount: if tokens exist in localStorage, rehydrate the session
  useEffect(() => {
    const access = localStorage.getItem('access')
    if (access) {
      fetchMe().finally(() => setIsLoading(false))
    } else {
      setIsLoading(false)
    }
  }, [fetchMe])

  const login = useCallback(async (username: string, password: string): Promise<AuthUser> => {
    const { data } = await api.post('/users/token/', { username, password })
    localStorage.setItem('access',  data.access)
    localStorage.setItem('refresh', data.refresh)
    const { data: me } = await api.get<AuthUser>('/users/me/')
    setUser(me)
    return me
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('access')
    localStorage.removeItem('refresh')
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

// Convenience hook — throws if used outside AuthProvider
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
