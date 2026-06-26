import { useState, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Search, ChevronDown, Users, UserPlus, FileText, CheckCircle, TrendingUp, BarChart2, Pencil, ShieldAlert } from 'lucide-react'
import api from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type {
  CandidatePool, SourceEntry, FunnelStage, InterviewOutcomes,
  OpenJobs, TimeToFill,
} from '@/components/analytics/Widgets'
import {
  WidgetCard, SourceBar, OpenJobsWidget,
  PipelineFunnelWidget, InterviewOutcomesWidget, TimeToFillWidget,
  Empty,
} from '@/components/analytics/Widgets'

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserEntry {
  id: number
  first_name: string
  last_name: string
  role: string
  role_display: string
  is_active: boolean
  reports_to: number | null
  last_login: string | null
}

interface RecruiterStats {
  total: number
  active: number
  placed: number
  conversion_rate: number
}

interface UserAnalyticsData {
  candidate_pool:       CandidatePool
  source_effectiveness: SourceEntry[]
  open_jobs:            OpenJobs
  pipeline_funnel:      FunnelStage[]
  interview_outcomes:   InterviewOutcomes
  time_to_fill:         TimeToFill
  recruiter_stats:      RecruiterStats
}

// ── Recruiter stats widget (replaces leaderboard for per-user view) ────────────

const KPI_CFG = [
  { label: 'Total Submittals', key: 'total',           color: '#2563eb', icon: FileText,    fmt: (v: number) => String(v) },
  { label: 'Active',           key: 'active',          color: '#3b82f6', icon: Users,       fmt: (v: number) => String(v) },
  { label: 'Placed',           key: 'placed',          color: '#60a5fa', icon: CheckCircle, fmt: (v: number) => String(v) },
  { label: 'Conversion Rate',  key: 'conversion_rate', color: '#2563eb', icon: TrendingUp,  fmt: (v: number) => `${v}%`  },
] as const

function RecruiterStatsWidget({ data, loading }: { data: RecruiterStats | undefined; loading: boolean }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {KPI_CFG.map(({ label, key, color, icon: Icon, fmt }) => (
        <div
          key={label}
          className="rounded-xl p-5 transition-all hover:brightness-110"
          style={{
            background: `linear-gradient(135deg, ${color}12 0%, rgba(255,255,255,0.018) 100%)`,
            border:     '1px solid rgba(255,255,255,0.07)',
            borderLeft: `3px solid ${color}`,
            boxShadow:  `0 2px 12px ${color}18`,
          }}
        >
          {loading ? (
            <>
              <div className="h-8 w-16 mb-2 animate-pulse bg-white/10 rounded" />
              <div className="h-3 w-20 animate-pulse bg-white/10 rounded" />
            </>
          ) : (
            <>
              <div className="flex items-start justify-between mb-2">
                <p className="text-2xl font-bold text-slate-100 stat-num">
                  {data ? fmt(data[key]) : '—'}
                </p>
                <Icon className="h-4 w-4 mt-1" style={{ color }} />
              </div>
              <p className="text-xs text-slate-500">{label}</p>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Add User dialog ────────────────────────────────────────────────────────────

const addUserSchema = z.object({
  first_name: z.string().min(1, 'Required'),
  last_name:  z.string().min(1, 'Required'),
  username:   z.string().min(1, 'Required'),
  email:      z.string().email('Valid email required'),
  role:       z.enum(['recruiter', 'team_lead', 'vp', 'ceo']),
  reports_to: z.coerce.number().optional().nullable(),
  password:   z.string().min(8, 'Min 8 characters'),
  password2:  z.string().min(1, 'Required'),
}).refine(d => d.password === d.password2, {
  message: 'Passwords do not match', path: ['password2'],
})

type AddUserValues = z.infer<typeof addUserSchema>

function AddUserDialog({ teamLeads, onSuccess, callerRole }: { teamLeads: UserEntry[]; onSuccess: () => void; callerRole: string }) {
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState('')
  const qc = useQueryClient()
  const availableRoles = callerRole === 'ceo'
    ? [{ value: 'recruiter', label: 'Recruiter' }, { value: 'team_lead', label: 'Team Lead' }, { value: 'vp', label: 'VP' }, { value: 'ceo', label: 'CEO' }]
    : [{ value: 'recruiter', label: 'Recruiter' }, { value: 'team_lead', label: 'Team Lead' }, { value: 'vp', label: 'VP' }]

  const { register, handleSubmit, watch, reset, formState: { errors, isSubmitting } } = useForm<AddUserValues>({
    resolver: zodResolver(addUserSchema),
    defaultValues: { role: 'recruiter' },
  })

  const role = watch('role')
  const needsReportsTo = ['recruiter', 'team_lead'].includes(role)

  const mutation = useMutation({
    mutationFn: (data: AddUserValues) => {
      const payload: Record<string, unknown> = { ...data }
      if (!needsReportsTo || !payload.reports_to) delete payload.reports_to
      return api.post('/users/register/', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users-list'] })
      setOpen(false)
      reset()
      setServerError('')
      onSuccess()
    },
    onError: (err: any) => {
      const data = err?.response?.data
      const msg = data
        ? Object.values(data).flat().join(' ')
        : 'Failed to create user.'
      setServerError(msg)
    },
  })

  function onSubmit(values: AddUserValues) {
    setServerError('')
    mutation.mutate(values)
  }

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) { reset(); setServerError('') } }}>
      <DialogTrigger asChild>
        <Button className="flex items-center gap-2 h-10 px-4 text-sm">
          <UserPlus className="h-4 w-4" />
          Add User
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Team Member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First Name</Label>
              <Input {...register('first_name')} placeholder="Jane" />
              {errors.first_name && <p className="text-xs text-red-400">{errors.first_name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Last Name</Label>
              <Input {...register('last_name')} placeholder="Smith" />
              {errors.last_name && <p className="text-xs text-red-400">{errors.last_name.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Username</Label>
            <Input {...register('username')} placeholder="jane.smith" autoComplete="off" />
            {errors.username && <p className="text-xs text-red-400">{errors.username.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input {...register('email')} type="email" placeholder="jane@company.com" />
            {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Role</Label>
            <select {...register('role')}
              className="h-9 w-full rounded-md border border-white/[0.12] bg-[#0d1117] text-slate-200 px-3 py-1 text-sm"
            >
              {availableRoles.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          {needsReportsTo && (
            <div className="space-y-1.5">
              <Label>Reports To <span className="text-slate-500">(optional)</span></Label>
              <select {...register('reports_to')}
                className="h-9 w-full rounded-md border border-white/[0.12] bg-[#0d1117] text-slate-200 px-3 py-1 text-sm"
              >
                <option value="">— None —</option>
                {teamLeads.map(tl => (
                  <option key={tl.id} value={tl.id}>{tl.first_name} {tl.last_name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Password</Label>
              <Input {...register('password')} type="password" placeholder="Min 8 chars" autoComplete="new-password" />
              {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Confirm Password</Label>
              <Input {...register('password2')} type="password" placeholder="••••••••" autoComplete="new-password" />
              {errors.password2 && <p className="text-xs text-red-400">{errors.password2.message}</p>}
            </div>
          </div>

          {serverError && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{serverError}</p>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create User'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Edit User dialog ───────────────────────────────────────────────────────────

const editUserSchema = z.object({
  role:       z.enum(['recruiter', 'team_lead', 'vp', 'ceo']),
  reports_to: z.coerce.number().optional().nullable(),
  is_active:  z.boolean(),
})
type EditUserValues = z.infer<typeof editUserSchema>

function EditUserDialog({
  user,
  teamLeads,
  callerRole,
  open,
  onClose,
}: {
  user: UserEntry
  teamLeads: UserEntry[]
  callerRole: string
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [serverError, setServerError] = useState('')

  const { register, handleSubmit, watch, reset, formState: { isSubmitting } } = useForm<EditUserValues>({
    resolver: zodResolver(editUserSchema),
    values: { role: user.role as EditUserValues['role'], reports_to: user.reports_to, is_active: user.is_active },
  })

  const role = watch('role')
  const needsReportsTo = ['recruiter', 'team_lead'].includes(role)

  const mutation = useMutation({
    mutationFn: (data: EditUserValues) => {
      const payload: Record<string, unknown> = { role: data.role, is_active: data.is_active }
      if (needsReportsTo) payload.reports_to = data.reports_to || null
      return api.patch(`/users/${user.id}/`, payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users-list'] })
      setServerError('')
      onClose()
    },
    onError: (err: any) => {
      const data = err?.response?.data
      setServerError(data ? Object.values(data).flat().join(' ') : 'Failed to update user.')
    },
  })

  const availableRoles = callerRole === 'ceo'
    ? [{ value: 'recruiter', label: 'Recruiter' }, { value: 'team_lead', label: 'Team Lead' }, { value: 'vp', label: 'VP' }, { value: 'ceo', label: 'CEO' }]
    : [{ value: 'recruiter', label: 'Recruiter' }, { value: 'team_lead', label: 'Team Lead' }, { value: 'vp', label: 'VP' }]

  function handleClose() { reset(); setServerError(''); onClose() }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit {user.first_name} {user.last_name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(v => mutation.mutateAsync(v))} className="space-y-4 mt-2">

          <div className="space-y-1.5">
            <Label>Role</Label>
            <select {...register('role')}
              className="h-9 w-full rounded-md border border-white/[0.12] bg-[#0d1117] text-slate-200 px-3 py-1 text-sm"
            >
              {availableRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          {needsReportsTo && (
            <div className="space-y-1.5">
              <Label>Reports To <span className="text-slate-500">(optional)</span></Label>
              <select {...register('reports_to')}
                className="h-9 w-full rounded-md border border-white/[0.12] bg-[#0d1117] text-slate-200 px-3 py-1 text-sm"
              >
                <option value="">— None —</option>
                {teamLeads.filter(tl => tl.id !== user.id).map(tl => (
                  <option key={tl.id} value={tl.id}>{tl.first_name} {tl.last_name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-3">
            <input type="checkbox" id="is_active" {...register('is_active')} className="h-4 w-4 accent-blue-500 cursor-pointer" />
            <Label htmlFor="is_active" className="cursor-pointer">Active account</Label>
          </div>

          {serverError && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{serverError}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Admin password reset dialog ────────────────────────────────────────────────

function ResetPasswordDialog({
  user,
  open,
  onClose,
}: {
  user: UserEntry
  open: boolean
  onClose: () => void
}) {
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleReset() {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post(`/users/${user.id}/reset-password/`)
      setTempPassword(data.temp_password)
    } catch {
      setError('Failed to reset password.')
    } finally {
      setLoading(false)
    }
  }

  function handleClose() { setTempPassword(null); setError(''); onClose() }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Reset Password</DialogTitle></DialogHeader>
        {tempPassword ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-400">New temporary password for <span className="font-medium text-slate-200">{user.first_name} {user.last_name}</span>:</p>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 font-mono text-blue-300 text-sm">
              {tempPassword}
            </div>
            <p className="text-xs text-slate-500">Share this securely. The user should change it on next login.</p>
            <div className="flex justify-end"><Button onClick={handleClose}>Done</Button></div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <ShieldAlert className="h-4 w-4 text-amber-400 flex-shrink-0" />
              <p className="text-xs text-amber-300">This will immediately invalidate <strong>{user.first_name} {user.last_name}</strong>'s current password.</p>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
              <Button size="sm" disabled={loading} onClick={handleReset} className="bg-amber-600 hover:bg-amber-700 text-white">
                {loading ? 'Resetting…' : 'Reset Password'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Employee picker ────────────────────────────────────────────────────────────

function EmployeePicker({
  users,
  selectedId,
  onSelect,
}: {
  users: UserEntry[]
  selectedId: number | null
  onSelect: (id: number) => void
}) {
  const [search,    setSearch]    = useState('')
  const [open,      setOpen]      = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = users.find(u => u.id === selectedId)
  const filtered = users.filter(u =>
    `${u.first_name} ${u.last_name}`.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function pick(user: UserEntry) {
    onSelect(user.id)
    setOpen(false)
    setSearch('')
  }

  return (
    <div ref={containerRef} className="relative flex-1 min-w-[160px] sm:w-80 sm:flex-none">
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 h-10 px-3 rounded-lg border border-white/[0.12] bg-[#0d1117] text-sm text-slate-200 hover:border-white/[0.25] transition-colors"
      >
        <span className={selected ? 'text-slate-100' : 'text-slate-500'}>
          {selected ? `${selected.first_name} ${selected.last_name}` : 'Select employee…'}
        </span>
        <ChevronDown className="h-4 w-4 text-slate-500 flex-shrink-0" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-white/[0.12] bg-[#0d1117] shadow-xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.06]">
            <Search className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none"
            />
          </div>

          {/* Results */}
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-500">No employees found</li>
            )}
            {filtered.map(u => (
              <li key={u.id}>
                <button
                  onClick={() => pick(u)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-white/[0.06] transition-colors text-left"
                >
                  <span className="font-medium text-slate-200">{u.first_name} {u.last_name}</span>
                  <span className="text-xs text-slate-500">{u.role_display}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Org chart ─────────────────────────────────────────────────────────────────

function OrgChart({ users, onSelect }: { users: UserEntry[]; onSelect: (id: number) => void }) {
  const teamLeads = users.filter(u => u.role === 'team_lead')
  const unassigned = users.filter(u => u.role === 'recruiter' && !u.reports_to)

  function Avatar({ u }: { u: UserEntry }) {
    return (
      <button
        onClick={() => onSelect(u.id)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.05] transition-colors text-left w-full group"
      >
        <div className="h-7 w-7 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-blue-300">
          {u.first_name[0]}{u.last_name[0]}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-200 group-hover:text-white truncate">
            {u.first_name} {u.last_name}
            {!u.is_active && <span className="ml-1.5 text-[10px] text-red-400">inactive</span>}
          </p>
          <p className="text-[10px] text-slate-500">{u.role_display}</p>
        </div>
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#0d1117] overflow-hidden" style={{ borderTop: '2px solid #2563eb' }}>
      <div className="px-4 py-3 border-b border-white/[0.04]">
        <p className="text-sm font-semibold text-slate-200">Team Structure</p>
        <p className="text-xs text-slate-500 mt-0.5">{users.length} member{users.length !== 1 ? 's' : ''} · click any name to view analytics</p>
      </div>
      <div className="p-4 space-y-4">
        {teamLeads.map(tl => {
          const reports = users.filter(u => u.role === 'recruiter' && u.reports_to === tl.id)
          return (
            <div key={tl.id}>
              <Avatar u={tl} />
              {reports.length > 0 && (
                <div className="ml-5 mt-1 border-l border-white/[0.07] pl-4 space-y-0.5">
                  {reports.map(r => <Avatar key={r.id} u={r} />)}
                </div>
              )}
            </div>
          )
        })}
        {unassigned.length > 0 && (
          <div>
            <p className="px-3 pb-1 text-[10px] uppercase tracking-widest text-slate-600 font-semibold">Unassigned</p>
            <div className="space-y-0.5">
              {unassigned.map(u => <Avatar key={u.id} u={u} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function People() {
  const { user: authUser } = useAuth()
  const isManager = ['vp', 'ceo'].includes(authUser?.role ?? '')

  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('user') ? Number(searchParams.get('user')) : null
  const [editTarget, setEditTarget] = useState<UserEntry | null>(null)
  const [resetTarget, setResetTarget] = useState<UserEntry | null>(null)

  const { data: users = [], isSuccess: usersLoaded } = useQuery<UserEntry[]>({
    queryKey: ['users-list'],
    queryFn:  () => api.get('/users/', { params: { page_size: 200 } })
                       .then(r => (r.data.results ?? r.data) as UserEntry[])
                       .then(list => list.filter(u => ['recruiter', 'team_lead'].includes(u.role))),
  })

  const { data, isLoading, isError, error } = useQuery<UserAnalyticsData>({
    queryKey: ['user-analytics', selectedId],
    queryFn:  () => api.get(`/dashboard/analytics/user/${selectedId}/`).then(r => r.data),
    enabled:  selectedId !== null,
    retry:    false,
  })

  // Clear selection if the analytics request is forbidden (e.g. stale out-of-pod URL)
  const clearSelection = useCallback(() => setSearchParams({}), [setSearchParams])
  useEffect(() => {
    if (isError && (error as any)?.response?.status === 403) {
      clearSelection()
    }
  }, [isError, error, clearSelection])

  const selected = users.find(u => u.id === selectedId)
  const teamLeads = users.filter(u => u.role === 'team_lead')
  const sources  = data?.source_effectiveness ?? []
  const maxCandidates = sources.length > 0 ? Math.max(...sources.map(s => s.candidates)) : 1

  function selectUser(id: number) {
    setSearchParams({ user: String(id) })
  }

  return (
    <div className="space-y-5">

      {/* ── Header + picker ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-slate-400">View performance and analytics for any team member</p>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {isManager && <AddUserDialog teamLeads={teamLeads} onSuccess={() => {}} callerRole={authUser?.role ?? ''} />}
          <EmployeePicker users={users} selectedId={selectedId} onSelect={selectUser} />
        </div>
      </div>

      {/* ── Empty state ── */}
      {!selectedId && (
        <div className="flex flex-col items-center justify-center h-64 rounded-xl border border-white/[0.06] bg-[#0d1117] gap-3">
          <div className="p-3 rounded-full bg-blue-500/10">
            <Users className="h-6 w-6 text-blue-400" />
          </div>
          {usersLoaded && users.length === 0 ? (
            <>
              <p className="text-sm font-medium text-slate-300">No team members assigned yet.</p>
              <p className="text-xs text-slate-500">Ask your manager to assign recruiters to your pod.</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-300">Select an employee to view their performance</p>
              <p className="text-xs text-slate-500">Use the dropdown above to choose a recruiter or team lead</p>
            </>
          )}
        </div>
      )}

      {/* ── Org chart (shown when no user selected and data is loaded) ── */}
      {!selectedId && usersLoaded && users.length > 0 && (
        <OrgChart users={users} onSelect={selectUser} />
      )}

      {/* ── Analytics ── */}
      {selectedId && (
        <>
          {/* Selected employee profile strip */}
          {selected && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#0d1117] border border-white/[0.06]">
              <div className="h-9 w-9 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-semibold text-blue-300">
                  {selected.first_name[0]}{selected.last_name[0]}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-100">{selected.first_name} {selected.last_name}</p>
                <p className="text-xs text-slate-500">
                  {selected.role_display}
                  {!selected.is_active && <span className="ml-2 text-red-400 font-medium">· Inactive</span>}
                  {selected.last_login && <span className="ml-2">· Last login {new Date(selected.last_login).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                </p>
              </div>
              {isManager && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setEditTarget(selected)}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 px-2 py-1.5 rounded hover:bg-white/[0.06] transition-colors"
                    title="Edit user"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => setResetTarget(selected)}
                    className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 px-2 py-1.5 rounded hover:bg-amber-500/10 transition-colors"
                    title="Reset password"
                  >
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Reset PW
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Row 1: Recruiter stats */}
          <RecruiterStatsWidget data={data?.recruiter_stats} loading={isLoading} />

          {/* Row 2: Source effectiveness | Open jobs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <WidgetCard title="Source Effectiveness" loading={isLoading}>
              {sources.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
                  <div className="h-8 w-8 rounded-full bg-white/[0.04] flex items-center justify-center">
                    <BarChart2 className="h-4 w-4 text-slate-600" />
                  </div>
                  <p className="text-xs text-slate-500">Tag candidates with a source<br />to see breakdown here</p>
                </div>
              ) : (
                <div className="space-y-3">{sources.map(s => <SourceBar key={s.source} entry={s} max={maxCandidates} />)}</div>
              )}
            </WidgetCard>
            <WidgetCard title="Open Jobs Breakdown" loading={isLoading}>
              {data?.open_jobs ? <OpenJobsWidget data={data.open_jobs} /> : <Empty />}
            </WidgetCard>
          </div>

          {/* Row 3: Pipeline funnel | Interview outcomes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <WidgetCard title="Pipeline Funnel" loading={isLoading}>
              <PipelineFunnelWidget stages={data?.pipeline_funnel ?? []} />
            </WidgetCard>
            <WidgetCard title="Interview Outcomes" loading={isLoading}>
              {data?.interview_outcomes ? <InterviewOutcomesWidget data={data.interview_outcomes} /> : <Empty />}
            </WidgetCard>
          </div>

          {/* Row 4: Time to fill */}
          <WidgetCard title="Time to Fill" loading={isLoading}>
            {data?.time_to_fill ? <TimeToFillWidget data={data.time_to_fill} /> : <Empty />}
          </WidgetCard>
        </>
      )}

      {/* ── Edit / Reset dialogs ── */}
      {editTarget && (
        <EditUserDialog
          user={editTarget}
          teamLeads={teamLeads}
          callerRole={authUser?.role ?? ''}
          open={true}
          onClose={() => setEditTarget(null)}
        />
      )}
      {resetTarget && (
        <ResetPasswordDialog
          user={resetTarget}
          open={true}
          onClose={() => setResetTarget(null)}
        />
      )}
    </div>
  )
}
