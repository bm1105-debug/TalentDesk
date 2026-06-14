// What this file does: the persistent app shell — sidebar nav on the left,
// top header on the right, page content rendered in the middle via <Outlet />.

import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, Briefcase, FileText,
  Calendar, Mail, Search, LogOut,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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

        {/* Logged-in user + logout at the bottom */}
        <div className="p-4 border-t border-gray-200">
          <p className="text-xs text-gray-500 truncate mb-2">
            {user?.first_name} {user?.last_name}
            <span className="ml-1 text-gray-400">· {user?.role}</span>
          </p>
          <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-gray-600"
            onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* ── Main content area ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top header bar */}
        <header className="h-14 flex items-center px-6 bg-white border-b border-gray-200">
          {/* Page title rendered by each page via document.title or a context — placeholder for now */}
          <span className="text-sm text-gray-400">TalentDesk ATS</span>
        </header>

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>

    </div>
  )
}
