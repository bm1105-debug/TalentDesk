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
            <p className="text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2">
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
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{error}</p>
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

function SectionLabel({ label, collapsed, divider = false }: { label: string; collapsed: boolean; divider?: boolean }) {
  if (collapsed) return <div className="my-1 border-t border-white/5" />
  return (
    <>
      {divider && <hr className="mx-3 my-1 border-t border-white/[0.06]" />}
      <p
        className="px-3 pt-3 pb-1 uppercase select-none"
        style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', letterSpacing: '0.15em', fontWeight: 700 }}
      >
        {label}
      </p>
    </>
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
          'nav-link flex items-center gap-3 rounded-lg relative transition-colors',
          collapsed ? 'px-2 py-2 justify-center' : 'px-3 py-2',
          isActive ? 'active' : ''
        )
      }
    >
      <Icon className="h-4 w-4 flex-shrink-0" style={{ color: 'inherit' }} />
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
    /* ── Root shell: direct style injection on .flex.h-screen ───────── */
    <div className="flex h-screen" style={{ background: 'var(--td-bg)', transition: 'background 0.3s ease' }}>


      {/* ── Sidebar: direct style injection on the sidebar container ──── */}
      <aside
        className={cn('flex-shrink-0 flex flex-col transition-all duration-200', collapsed ? 'w-14' : 'w-60')}
        style={{
          background:   'linear-gradient(180deg, #1e1b4b 0%, #1a1a2e 100%)',
          borderRight:  '1px solid rgba(255,255,255,0.06)',
          boxShadow:    '4px 0 24px rgba(0,0,0,0.3)',
          transition:   'width 0.2s ease',
        }}
      >

        {/* Logo + collapse toggle */}
        <div
          className={cn('h-14 flex items-center flex-shrink-0', collapsed ? 'justify-center px-2' : 'justify-between px-4')}
          style={{ borderBottom: '1px solid var(--td-border-subtle)' }}
        >
          {!collapsed && (
            <span style={{
              background:             'linear-gradient(135deg, #6366f1, #8b5cf6, #06b6d4)',
              WebkitBackgroundClip:   'text',
              WebkitTextFillColor:    'transparent',
              backgroundClip:         'text',
              fontSize:               '18px',
              fontWeight:             900,
              letterSpacing:          '-0.5px',
            }}>TalentDesk</span>
          )}
          <button
            onClick={toggleCollapsed}
            className="p-1 rounded-md transition-colors text-slate-600 hover:text-slate-200 hover:bg-white/5"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Nav links — fade gradient hint at bottom */}
        <div className="flex-1 overflow-y-auto relative">
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0 z-10"
            style={{ height: '60px', background: 'linear-gradient(to top, #12121f 0%, transparent 100%)' }}
          />
          <nav className="py-2 px-2 space-y-0.5">
            <SectionLabel label="Recruiting" collapsed={collapsed} />
            {RECRUITING_ITEMS.map(item => (
              <NavItem key={item.to} {...item} collapsed={collapsed} />
            ))}

            <SectionLabel label="Management" collapsed={collapsed} divider />
            {MANAGEMENT_ITEMS.map(item => (
              <NavItem key={item.to} {...item} collapsed={collapsed} />
            ))}
            {isManager && (
              <NavItem to="/activity" label="Audit Log" icon={ClipboardList} collapsed={collapsed} />
            )}
          </nav>
        </div>

        {/* User area */}
        <div
          className={cn('p-2', collapsed && 'flex justify-center')}
          style={{ borderTop: '1px solid var(--td-border-subtle)' }}
        >
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className={cn(
                'flex items-center gap-2.5 rounded-lg hover:bg-white/5 transition-colors',
                collapsed ? 'p-1' : 'w-full px-2 py-1.5 text-left'
              )}>
                {user && (
                  <InitialsAvatar
                    id={user.id}
                    firstName={user.first_name ?? ''}
                    lastName={user.last_name ?? ''}
                    size="sm"
                    style={{
                      background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                      boxShadow:  '0 0 0 2px rgba(99,102,241,0.5), 0 4px 12px rgba(99,102,241,0.4)',
                    }}
                  />
                )}
                {!collapsed && user && (
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-200 truncate">
                      {user.first_name} {user.last_name}
                    </p>
                    <p className="text-[10px] text-slate-600 capitalize">{user.role?.replace('_', ' ')}</p>
                  </div>
                )}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                side="right"
                align="end"
                sideOffset={8}
                className="min-w-[168px] rounded-xl shadow-2xl p-1 z-50"
                style={{ background: 'var(--td-surface)', border: '1px solid var(--td-border)' }}
              >
                <DropdownMenu.Item
                  onSelect={() => setPwOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 rounded-lg hover:bg-white/5 hover:text-slate-200 cursor-pointer outline-none transition-colors"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Change password
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="my-1 border-t border-white/5" />
                <DropdownMenu.Item
                  onSelect={handleLogout}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 rounded-lg hover:bg-red-500/10 cursor-pointer outline-none"
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


        {/* ── Header: direct style injection on the header bar ──────── */}
        <header
          className="h-14 flex items-center justify-between px-6"
          style={{
            background:     'rgba(18, 18, 31, 0.85)',
            backdropFilter: 'blur(20px) saturate(180%)',
            borderBottom:   '1px solid rgba(255,255,255,0.08)',
            boxShadow:      '0 1px 0 rgba(255,255,255,0.05), 0 4px 20px rgba(0,0,0,0.2)',
          }}
        >
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.3px' }}>
            {getPageTitle(location.pathname)}
          </span>

          {/* Search trigger — opens Command Bar */}
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))}
            className="header-search hidden md:flex items-center gap-2 px-3 py-1.5 text-sm"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search jobs, candidates…</span>
            <kbd
              className="ml-1 text-[10px] font-semibold px-1 py-0.5"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)', borderRadius: '5px' }}
            >⌘K</kbd>
          </button>

          <NotificationBell />
        </header>

        {/* ── Main content: direct style injection on main ─────────── */}
        <main className="flex-1 overflow-y-auto p-6" style={{
          background: 'radial-gradient(ellipse at 20% 50%, rgba(99,102,241,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(139,92,246,0.06) 0%, transparent 50%), #0f0f1a',
          transition: 'background 0.3s ease',
        }}>
          <Outlet />
        </main>
      </div>

      <CommandBar />

    </div>
  )
}
