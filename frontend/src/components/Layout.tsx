import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, Briefcase, FileText,
  Calendar, Mail, Search, LogOut, KeyRound, BarChart2, TrendingUp, Award,
  ClipboardList, HandCoins, ChevronLeft, ChevronRight,
} from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import api from '@/api/client'
import NotificationBell from '@/components/NotificationBell'
import CommandBar from '@/components/CommandBar'
import InitialsAvatar from '@/components/InitialsAvatar'

// ── Route → page title map ─────────────────────────────────────────────────

const ROUTE_LABELS: Record<string, string> = {
  '/dashboard':      'Dashboard',
  '/candidates':     'Candidates',
  '/jobs':           'Jobs',
  '/submittals':     'Submittals',
  '/interviews':     'Interviews',
  '/communications': 'Communications',
  '/search':         'Search',
  '/reports':        'Reports',
  '/analytics':      'Analytics',
  '/scorecard':      'My Scorecard',
  '/offers':         'Offers',
  '/activity':       'Audit Log',
}

function getPageTitle(pathname: string): string {
  const segment = '/' + pathname.split('/')[1]
  return ROUTE_LABELS[segment] ?? 'TalentDesk'
}

// ── Change password dialog ─────────────────────────────────────────────────

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
              <Input type="password" value={fields.old_password}
                onChange={e => setFields(f => ({ ...f, old_password: e.target.value }))} required />
            </div>
            <div className="space-y-1">
              <Label>New password</Label>
              <Input type="password" value={fields.new_password}
                onChange={e => setFields(f => ({ ...f, new_password: e.target.value }))} required />
            </div>
            <div className="space-y-1">
              <Label>Confirm new password</Label>
              <Input type="password" value={fields.new_password2}
                onChange={e => setFields(f => ({ ...f, new_password2: e.target.value }))} required />
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Update Password'}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Nav section label ──────────────────────────────────────────────────────

function SectionLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return <div className="my-1 border-t border-gray-100" />
  return (
    <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400 select-none">
      {label}
    </p>
  )
}

// ── Nav items ──────────────────────────────────────────────────────────────

const RECRUITING_ITEMS = [
  { to: '/dashboard',      label: 'Dashboard',      icon: LayoutDashboard },
  { to: '/candidates',     label: 'Candidates',     icon: Users },
  { to: '/jobs',           label: 'Jobs',           icon: Briefcase },
  { to: '/submittals',     label: 'Submittals',     icon: FileText },
  { to: '/interviews',     label: 'Interviews',     icon: Calendar },
  { to: '/communications', label: 'Communications', icon: Mail },
  { to: '/search',         label: 'Search',         icon: Search },
]

const MANAGEMENT_ITEMS = [
  { to: '/reports',    label: 'Reports',      icon: BarChart2 },
  { to: '/analytics',  label: 'Analytics',    icon: TrendingUp },
  { to: '/scorecard',  label: 'My Scorecard', icon: Award },
  { to: '/offers',     label: 'Offers',       icon: HandCoins },
]

function NavItem({ to, label, icon: Icon, collapsed }: {
  to: string; label: string; icon: React.ElementType; collapsed: boolean
}) {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md text-sm font-medium transition-colors relative',
          collapsed ? 'px-2 py-2 justify-center' : 'px-3 py-2',
          isActive
            ? 'bg-blue-50 text-blue-700 border-l-2 border-blue-600'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 border-l-2 border-transparent'
        )
      }
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {!collapsed && label}
    </NavLink>
  )
}

// ── Layout ─────────────────────────────────────────────────────────────────

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [pwOpen, setPwOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('td_sidebar_collapsed') === 'true'
  })

  function toggleCollapsed() {
    setCollapsed(c => {
      const next = !c
      localStorage.setItem('td_sidebar_collapsed', String(next))
      return next
    })
  }

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const isManager = ['account_manager', 'ceo', 'team_lead'].includes(user?.role ?? '')

  return (
    <div className="flex h-screen bg-gray-50">

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside className={cn(
        'flex-shrink-0 bg-white border-r border-gray-200 flex flex-col transition-all duration-200',
        collapsed ? 'w-14' : 'w-60'
      )}>

        {/* Logo + collapse toggle */}
        <div className={cn(
          'h-14 flex items-center border-b border-gray-200 flex-shrink-0',
          collapsed ? 'justify-center px-2' : 'justify-between px-4'
        )}>
          {!collapsed && (
            <span className="text-lg font-bold text-blue-700 tracking-tight">TalentDesk</span>
          )}
          <button
            onClick={toggleCollapsed}
            className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Nav links — relative wrapper holds the fade gradient hint */}
        <div className="flex-1 overflow-y-auto relative">
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent z-10" />
        <nav className="py-2 px-2 space-y-0.5">
          <SectionLabel label="Recruiting" collapsed={collapsed} />
          {RECRUITING_ITEMS.map(item => (
            <NavItem key={item.to} {...item} collapsed={collapsed} />
          ))}

          <SectionLabel label="Management" collapsed={collapsed} />
          {MANAGEMENT_ITEMS.map(item => (
            <NavItem key={item.to} {...item} collapsed={collapsed} />
          ))}
          {isManager && (
            <NavItem to="/activity" label="Audit Log" icon={ClipboardList} collapsed={collapsed} />
          )}
        </nav>
        </div>

        {/* User area */}
        <div className={cn('p-2 border-t border-gray-200', collapsed && 'flex justify-center')}>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className={cn(
                'flex items-center gap-2.5 rounded-lg hover:bg-gray-100 transition-colors',
                collapsed ? 'p-1' : 'w-full px-2 py-1.5 text-left'
              )}>
                {user && (
                  <InitialsAvatar
                    id={user.id}
                    firstName={user.first_name ?? ''}
                    lastName={user.last_name ?? ''}
                    size="sm"
                  />
                )}
                {!collapsed && user && (
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-800 truncate">
                      {user.first_name} {user.last_name}
                    </p>
                    <p className="text-[10px] text-gray-400 capitalize">{user.role?.replace('_', ' ')}</p>
                  </div>
                )}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                side="right"
                align="end"
                sideOffset={8}
                className="min-w-[168px] bg-white border border-gray-200 rounded-xl shadow-lg p-1 z-50"
              >
                <DropdownMenu.Item
                  onSelect={() => setPwOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 rounded-lg hover:bg-gray-100 cursor-pointer outline-none"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Change password
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="my-1 border-t border-gray-100" />
                <DropdownMenu.Item
                  onSelect={handleLogout}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 rounded-lg hover:bg-red-50 cursor-pointer outline-none"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>

        <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} />
      </aside>

      {/* ── Main content area ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Rainbow accent stripe */}
        <div className="h-[3px] flex-shrink-0" style={{
          background: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #06b6d4)',
        }} />

        {/* Top header */}
        <header className="h-14 flex items-center justify-between px-6 bg-white border-b border-gray-200">
          <span className="text-sm font-medium text-gray-700">
            {getPageTitle(location.pathname)}
          </span>
          {/* Search trigger — opens Command Bar */}
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))}
            className="hidden md:flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search jobs, candidates…</span>
            <kbd className="ml-1 text-[10px] font-semibold bg-white border border-gray-200 rounded px-1 py-0.5 text-gray-500">⌘K</kbd>
          </button>
          <NotificationBell />
        </header>

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>

      <CommandBar />

    </div>
  )
}
