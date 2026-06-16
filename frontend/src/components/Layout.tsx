// What this file does: the persistent app shell — sidebar nav on the left,
// top header on the right, page content rendered in the middle via <Outlet />.

import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Briefcase, FileText,
  Calendar, Mail, Search, LogOut, KeyRound,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import api from '@/api/client'
import NotificationBell from '@/components/NotificationBell'

function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [fields, setFields] = useState({ old_password: '', new_password: '', new_password2: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  function reset() {
    setFields({ old_password: '', new_password: '', new_password2: '' })
    setError('')
    setSuccess(false)
  }

  function handleClose() { reset(); onClose() }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (fields.new_password !== fields.new_password2) {
      setError('New passwords do not match.')
      return
    }
    setError('')
    setSaving(true)
    try {
      await api.post('/users/change-password/', fields)
      setSuccess(true)
    } catch (err: any) {
      const data = err?.response?.data
      if (data?.old_password) setError(data.old_password[0])
      else if (data?.new_password) setError(data.new_password[0])
      else setError('Failed to change password.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
              Password updated successfully.
            </p>
            <div className="flex justify-end">
              <Button onClick={handleClose}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>Current password</Label>
              <Input
                type="password"
                value={fields.old_password}
                onChange={e => setFields(f => ({ ...f, old_password: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>New password</Label>
              <Input
                type="password"
                value={fields.new_password}
                onChange={e => setFields(f => ({ ...f, new_password: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Confirm new password</Label>
              <Input
                type="password"
                value={fields.new_password2}
                onChange={e => setFields(f => ({ ...f, new_password2: e.target.value }))}
                required
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Update Password'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

const NAV_ITEMS = [
  { to: '/dashboard',      label: 'Dashboard',      icon: LayoutDashboard },
  { to: '/candidates',     label: 'Candidates',     icon: Users },
  { to: '/jobs',           label: 'Jobs',           icon: Briefcase },
  { to: '/submittals',     label: 'Submittals',     icon: FileText },
  { to: '/interviews',     label: 'Interviews',     icon: Calendar },
  { to: '/communications', label: 'Communications', icon: Mail },
  { to: '/search',         label: 'Search',         icon: Search },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [pwOpen, setPwOpen] = useState(false)

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-screen bg-gray-50">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className="w-60 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">

        {/* Logo */}
        <div className="h-14 flex items-center px-5 border-b border-gray-200">
          <span className="text-lg font-bold text-blue-700 tracking-tight">TalentDesk</span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )
              }
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Logged-in user + actions at the bottom */}
        <div className="p-4 border-t border-gray-200 space-y-1">
          <p className="text-xs text-gray-500 truncate mb-2">
            {user?.first_name} {user?.last_name}
            <span className="ml-1 text-gray-400">· {user?.role}</span>
          </p>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-gray-600"
            onClick={() => setPwOpen(true)}>
            <KeyRound className="h-4 w-4" />
            Change password
          </Button>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-gray-600"
            onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>

        <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} />
      </aside>

      {/* ── Main content area ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top header bar */}
        <header className="h-14 flex items-center justify-between px-6 bg-white border-b border-gray-200">
          <span className="text-sm text-gray-400">TalentDesk ATS</span>
          <NotificationBell />
        </header>

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>

    </div>
  )
}
