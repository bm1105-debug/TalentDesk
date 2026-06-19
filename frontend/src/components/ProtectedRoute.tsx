import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import type { ReactNode } from 'react'

const ROLE_LEVEL: Record<string, number> = {
  recruiter:       1,
  team_lead:       2,
  account_manager: 3,
  ceo:             4,
}

interface Props {
  children: ReactNode
  minRole?: string  // if set, redirect to /dashboard when user's role is below this
}

export default function ProtectedRoute({ children, minRole }: Props) {
  const { user, isAuthenticated, isLoading } = useAuth()

  if (isLoading) return null

  if (!isAuthenticated) return <Navigate to="/login" replace />

  if (minRole) {
    const required = ROLE_LEVEL[minRole] ?? 0
    const current  = ROLE_LEVEL[user?.role ?? ''] ?? 0
    if (current < required) return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
