import { useState, useRef, useEffect } from 'react'
import { NavLink, Link, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, Briefcase, FileText,
  Calendar, Mail, Search, LogOut, KeyRound, BarChart2, TrendingUp, Award,
  ScrollText, FileCheck, ChevronLeft, ChevronRight, ChevronDown, Contact, Layers, Menu,
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
import { Toaster } from '@/components/Toaster'

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
  '/people':         'People',
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
            <p className="text-sm text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-md px-3 py-2">
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

const PIPELINE_ITEMS = [
  { to: '/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/candidates', label: 'Candidates', icon: Users },
  { to: '/jobs',       label: 'Jobs',       icon: Briefcase },
  { to: '/submittals', label: 'Submittals', icon: FileText },
]

const WORKFLOW_ITEMS = [
  { to: '/interviews',     label: 'Interviews',     icon: Calendar },
  { to: '/communications', label: 'Communications', icon: Mail },
]

const INSIGHTS_ITEMS = [
  { to: '/search',    label: 'Search',       icon: Search },
  { to: '/reports',   label: 'Reports',      icon: BarChart2 },
  { to: '/analytics', label: 'Analytics',    icon: TrendingUp },
  { to: '/scorecard', label: 'My Scorecard', icon: Award },
]

const ADMIN_ITEMS = [
  { to: '/people',   label: 'People',    icon: Contact },
  { to: '/offers',   label: 'Offers',    icon: FileCheck },
  { to: '/activity', label: 'Audit Log', icon: ScrollText },
]

function NavItem({ to, label, icon: Icon, collapsed, onClick }: {
  to: string; label: string; icon: React.ElementType; collapsed: boolean; onClick?: () => void
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'nav-link flex items-center gap-3 rounded-lg relative transition-colors',
          collapsed ? 'px-2 py-2 justify-center' : 'px-3 py-2',
          isActive ? 'active' : ''
        )
      }
    >
      <Icon className={`flex-shrink-0 ${collapsed ? 'h-5 w-5' : 'h-4 w-4'}`} style={{ color: 'inherit' }} />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  )
}

// ── Layout ─────────────────────────────────────────────────────────────────

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const pageTitle = getPageTitle(location.pathname)
  const TitleTag = location.pathname === '/dashboard' ? 'h2' : 'h1'
  const [pwOpen, setPwOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // breadcrumb state for detail routes (e.g. /candidates/123)
  const isDetail = location.pathname.split('/').filter(Boolean).length > 1
  const parentSegment = '/' + location.pathname.split('/')[1]
  const parentLabel = isDetail ? (ROUTE_LABELS[parentSegment] ?? '') : ''
  const entityName = (location.state as { name?: string } | null)?.name
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('td_sidebar_collapsed') === 'true'
  })
  const [hovered, setHovered] = useState(false)
  const isExpanded = !collapsed || hovered
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showTopFade, setShowTopFade] = useState(false)
  const [showBottomFade, setShowBottomFade] = useState(true)
  useEffect(() => {
    const scrollEl = scrollRef.current
    const activeEl = scrollEl?.querySelector('a.active')
    if (scrollEl && activeEl) {
      activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [location.pathname])

  useEffect(() => {
    document.title = pageTitle !== 'TalentDesk' ? `${pageTitle} — TalentDesk` : 'TalentDesk'
  }, [pageTitle])

  function handleNavScroll() {
    const el = scrollRef.current
    if (!el) return
    setShowTopFade(el.scrollTop > 10)
    setShowBottomFade(el.scrollTop + el.clientHeight < el.scrollHeight - 10)
  }

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

  const isManager = ['vp', 'ceo', 'team_lead'].includes(user?.role ?? '')

  return (
    /* ── Root shell: direct style injection on .flex.h-screen ───────── */
    <div className="flex h-screen" style={{ background: 'var(--td-bg)', transition: 'background 0.3s ease' }}>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar: direct style injection on the sidebar container ──── */}
      <aside
        className={cn(
          'flex-shrink-0 flex flex-col',
          // Mobile: fixed drawer, slides in/out
          'fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-in-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop: relative, always visible, no translate
          'md:relative md:inset-auto md:translate-x-0 md:z-20',
          isExpanded ? 'w-[220px]' : 'md:w-14',
          // Mobile drawer always full width
          'w-[220px]',
        )}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background:  '#09090f',
          borderRight: '1px solid rgba(255,255,255,0.05)',
          boxShadow:   '4px 0 30px rgba(0,0,0,0.5)',
          transition:  'width 0.22s cubic-bezier(0.4,0,0.2,1), transform 0.2s ease-in-out',
        }}
      >

        {/* Logo */}
        <div
          className={cn('h-14 flex items-center flex-shrink-0 gap-2.5 overflow-hidden', isExpanded ? 'px-4' : 'justify-center px-2')}
          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div className="flex-shrink-0 rounded-lg p-1.5" style={{ background: 'linear-gradient(135deg, #1d4ed8, #2563eb)' }}>
            <Layers className="h-4 w-4 text-white" aria-hidden="true" />
          </div>
          {isExpanded && (
            <span style={{
              background:           'linear-gradient(135deg, #2563eb, #3b82f6, #60a5fa)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor:  'transparent',
              backgroundClip:       'text',
              fontSize:             '17px',
              fontWeight:           900,
              letterSpacing:        '-0.5px',
              whiteSpace:           'nowrap',
            }}>TalentDesk</span>
          )}
        </div>

        {/* Nav links — scroll-aware fade overlays */}
        <div ref={scrollRef} onScroll={handleNavScroll} className="sidebar-scroll flex-1 overflow-y-auto relative">
          {showTopFade && (
            <div className="pointer-events-none absolute top-0 left-0 right-0 h-10 z-10 bg-gradient-to-b from-[#09090f] to-transparent" />
          )}
          {showBottomFade && (
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 z-10 bg-gradient-to-t from-[#09090f] to-transparent" />
          )}
          <nav className="py-2 px-2 space-y-0.5">
            <SectionLabel label="Pipeline" collapsed={!isExpanded} />
            {PIPELINE_ITEMS.map(item => (
              <NavItem key={item.to} {...item} collapsed={!isExpanded} onClick={() => setMobileOpen(false)} />
            ))}

            <SectionLabel label="Workflow" collapsed={!isExpanded} divider />
            {WORKFLOW_ITEMS.map(item => (
              <NavItem key={item.to} {...item} collapsed={!isExpanded} onClick={() => setMobileOpen(false)} />
            ))}

            <SectionLabel label="Insights" collapsed={!isExpanded} divider />
            {INSIGHTS_ITEMS.filter(item =>
              !(item.to === '/scorecard' && user?.role === 'ceo')
            ).map(item => (
              <NavItem key={item.to} {...item} collapsed={!isExpanded} onClick={() => setMobileOpen(false)} />
            ))}

            <SectionLabel label="Admin" collapsed={!isExpanded} divider />
            {ADMIN_ITEMS.filter(item => {
              if ((item.to === '/people' || item.to === '/activity') && !isManager) return false
              return true
            }).map(item => (
              <NavItem key={item.to} {...item} collapsed={!isExpanded} onClick={() => setMobileOpen(false)} />
            ))}
          </nav>
        </div>

        {/* Bottom collapse toggle */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="w-full flex items-center justify-center gap-2 py-3 text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-colors text-xs font-medium"
          >
            <ChevronLeft
              className={`h-4 w-4 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>

        <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} />
      </aside>

      {/* ── Main content area ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">


        {/* ── Header: direct style injection on the header bar ──────── */}
        <header
          className="shrink-0 flex flex-col"
          style={{
            background:     'rgba(8, 8, 15, 0.85)',
            backdropFilter: 'blur(12px)',
            borderBottom:   '1px solid rgba(255,255,255,0.08)',
            boxShadow:      '0 4px 24px rgba(0,0,0,0.2)',
          }}
        >
          {/* Blue accent stripe */}
          <div style={{
            height: '2px',
            background: 'linear-gradient(90deg, #1d4ed8 0%, #3b82f6 50%, transparent 100%)',
          }} />
          <div className="h-14 flex items-center justify-between px-3 md:px-6">
          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 -ml-1 mr-1 text-slate-400 hover:text-slate-200 transition-colors rounded-lg hover:bg-white/5"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          {/* Left: breadcrumb on detail routes, plain title on list routes */}
          {isDetail && parentLabel ? (
            <nav className="flex items-center gap-1.5 min-w-0 shrink-0" aria-label="Breadcrumb">
              <Link
                to={parentSegment}
                className="text-sm text-slate-400 hover:text-slate-200 transition-colors whitespace-nowrap"
              >
                {parentLabel}
              </Link>
              <ChevronRight className="h-3.5 w-3.5 text-slate-600 shrink-0" />
              <span className="text-sm font-semibold text-slate-100 truncate max-w-[200px]">
                {entityName ?? '…'}
              </span>
            </nav>
          ) : (
            <TitleTag className="text-xl font-bold text-slate-100 shrink-0" style={{ margin: 0, letterSpacing: '-0.5px' }}>
              {pageTitle}
            </TitleTag>
          )}

          {/* Center: search trigger — opens Command Bar */}
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))}
            className="header-search hidden md:flex items-center gap-2 px-3 py-1.5 text-sm w-full max-w-md mx-6"
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 text-left">Search jobs, candidates…</span>
            <kbd className="ml-1 bg-white/[0.08] border border-white/[0.12] text-slate-500 text-[11px] rounded px-1.5 py-0.5 font-sans shrink-0">
              ⌘K
            </kbd>
          </button>

          <div className="flex items-center gap-1 shrink-0">
            <NotificationBell />

            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  className="flex items-center gap-1.5 p-1.5 rounded-lg hover:bg-white/[0.05] transition-colors group"
                  aria-label="Account menu"
                >
                  {user && (
                    <>
                      <div className="rounded-full transition-all group-hover:ring-2 group-hover:ring-blue-500/50">
                        <InitialsAvatar
                          id={user.id}
                          firstName={user.first_name ?? ''}
                          lastName={user.last_name ?? ''}
                          size="md"
                          style={{
                            background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
                            boxShadow:  '0 0 0 2px rgba(37,99,235,0.5), 0 4px 12px rgba(37,99,235,0.4)',
                          }}
                        />
                      </div>
                      <ChevronDown className="h-3 w-3 text-slate-500 group-hover:text-slate-300 transition-colors" />
                    </>
                  )}
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  side="bottom"
                  align="end"
                  sideOffset={8}
                  className="min-w-[168px] rounded-xl shadow-2xl p-1 z-50"
                  style={{ background: 'var(--td-surface)', border: '1px solid var(--td-border)' }}
                >
                  {user && (
                    <>
                      <div className="px-3 py-2 border-b border-white/5 mb-1">
                        <p className="text-xs font-medium text-slate-200 truncate">{user.first_name} {user.last_name}</p>
                        <p className="text-[10px] text-slate-500 capitalize">{user.role?.replace('_', ' ')}</p>
                      </div>
                    </>
                  )}
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
          </div>
        </header>

        {/* ── Main content: direct style injection on main ─────────── */}
        <main className="flex-1 overflow-y-auto p-3 md:p-6" style={{
          background: 'radial-gradient(ellipse at 15% 50%, rgba(37,99,235,0.11) 0%, transparent 55%), radial-gradient(ellipse at 85% 15%, rgba(59,130,246,0.08) 0%, transparent 45%), #08080f',
          transition: 'background 0.3s ease',
        }}>
          <Outlet />
        </main>
      </div>

      <CommandBar />
      <Toaster />

    </div>
  )
}
