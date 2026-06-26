import { useState, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Search, ChevronDown, Users, UserPlus, FileText, CheckCircle, TrendingUp, BarChart2 } from 'lucide-react'
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

function AddUserDialog({ teamLeads, onSuccess }: { teamLeads: UserEntry[]; onSuccess: () => void }) {
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState('')
  const qc = useQueryClient()

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
              <option value="recruiter">Recruiter</option>
              <option value="team_lead">Team Lead</option>
              <option value="vp">VP</option>
              <option value="ceo">CEO</option>
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
    <div ref={containerRef} className="relative w-80">
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

// ── Page ───────────────────────────────────────────────────────────────────────

export default function People() {
  const { user: authUser } = useAuth()
  const isManager = ['vp', 'ceo'].includes(authUser?.role ?? '')

  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('user') ? Number(searchParams.get('user')) : null

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
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">View performance and analytics for any team member</p>
        <div className="flex items-center gap-3">
          {isManager && <AddUserDialog teamLeads={teamLeads} onSuccess={() => {}} />}
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
              <div>
                <p className="text-sm font-semibold text-slate-100">{selected.first_name} {selected.last_name}</p>
                <p className="text-xs text-slate-500">{selected.role_display}</p>
              </div>
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
    </div>
  )
}
