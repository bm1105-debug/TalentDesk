// What this file does: wraps any route that requires a logged-in user.
// Shows nothing while the initial auth check runs (prevents flash of login page).
// Redirects to /login if there is no valid session.

import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import type { ReactNode } from 'react'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  // Still checking localStorage / fetching /users/me/ — render nothing yet
  if (isLoading) return null

  if (!isAuthenticated) return <Navigate to="/login" replace />

  return <>{children}</>
}
