// Dashboard — "My Day" with gradient stat cards, performance sidebar, and rich action panels.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import {
  Briefcase, FileText, AlertTriangle, Clock,
  HandCoins, TrendingUp, TrendingDown,
  CalendarDays, Trophy, ArrowRight,
  ListTodo, Plus, ChevronDown, ChevronUp,
  CheckSquare, CalendarCheck, Filter,
} from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import api from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/StatusBadge'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Trend { direction: 'up' | 'down' | 'flat'; pct: number }

interface InterviewToday {
  id: number
  scheduled_at: string
  interview_type: string
  candidate_name: string
  job_title: string
  client_name: string
  meeting_link: string
  location: string
}

interface JobDueSoon {
  id: number
  title: string
  client_name: string
  priority: string
  target_date: string
  days_left: number
}

interface OfferExpiringSoon {
  id: number
  candidate_name: string
  job_title: string
  expiry_date: string
  days_left: number
}

interface DashboardData {
  summary: {
    open_jobs_count: number
    active_submittals_count: number
    urgent_jobs_count: number
    overdue_jobs_count: number
    stale_submittals_count: number
    pending_offers_count: number
    interviews_today_count: number
    trends?: {
      open_jobs: Trend
      active_submittals: Trend
      urgent_jobs: Trend
      overdue_jobs: Trend
      pending_offers: Trend
    }
  }
  interviews_today: InterviewToday[]
  upcoming_deadlines: {
    jobs_due_soon: JobDueSoon[]
    offers_expiring_soon: OfferExpiringSoon[]
  }
}

interface ScorecardData {
  stats: { total: number; active: number; placed: number; conversion_rate: number }
  pipeline: { stage: string; count: number }[]
  recent_placements: { candidate: string; job: string; placed_at: string }[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
function greeting(name: string) {
  const h = new Date().getHours()
  return `${h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'}, ${name}`
}
function todayLabel() {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Sk({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-white/30 rounded-xl ${className}`} />
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="h-7 w-52 bg-white/15 rounded animate-pulse" />
        <div className="h-4 w-40 bg-white/10 rounded animate-pulse" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {['bg-blue-400','bg-violet-400','bg-red-400','bg-orange-400','bg-emerald-400'].map(c => (
          <div key={c} className={`${c} rounded-2xl p-5 space-y-4`}>
            <Sk className="h-8 w-8" /><Sk className="h-8 w-12" /><Sk className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-12 gap-4">
        <div className="panel-card col-span-4 p-5 space-y-4">
          <div className="h-4 w-28 bg-white/15 rounded animate-pulse" />
          <div className="flex justify-center"><div className="w-24 h-24 rounded-full bg-white/10 animate-pulse" /></div>
          {[1,2,3].map(i => <div key={i} className="h-3 bg-white/10 rounded animate-pulse" />)}
        </div>
        <div className="col-span-8 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            {[1, 2].map(i => (
              <div key={i} className="panel-card overflow-hidden">
                <div className="h-10 bg-white/5 animate-pulse" />
                {[1,2,3].map(j => <div key={j} className="h-12 border-b border-white/[0.04] animate-pulse" />)}
              </div>
            ))}
          </div>
          <div className="panel-card overflow-hidden">
            <div className="h-10 bg-white/5 animate-pulse" />
            {[1,2,3].map(j => <div key={j} className="h-14 border-b border-white/[0.04] animate-pulse" />)}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Status pills ───────────────────────────────────────────────────────────────

function StatusPill({ label, color, to }: { label: string; color: 'red' | 'purple' | 'cyan'; to?: string }) {
  void color
  const base = 'inline-flex items-center gap-1 text-white text-xs px-3 py-1 rounded-full border border-white/15 bg-white/10 transition-colors whitespace-nowrap'
  if (to) return (
    <Link to={to} className={`${base} hover:bg-white/15 cursor-pointer`}>
      {label}
      <ArrowRight className="h-3 w-3" aria-hidden="true" />
    </Link>
  )
  return <span className={base}>{label}</span>
}

// ── Stat cards ─────────────────────────────────────────────────────────────────

interface StatCardConfig {
  icon: React.ElementType
  borderColor: string
  iconBg: string
  iconText: string
}

const STAT_CARD_STYLES: StatCardConfig[] = [
  { icon: Briefcase,     borderColor: '#3b82f6', iconBg: 'bg-blue-500/20',    iconText: 'text-blue-400'    },
  { icon: FileText,      borderColor: '#8b5cf6', iconBg: 'bg-violet-500/20',  iconText: 'text-violet-400'  },
  { icon: AlertTriangle, borderColor: '#f59e0b', iconBg: 'bg-amber-500/20',   iconText: 'text-amber-400'   },
  { icon: Clock,         borderColor: '#ef4444', iconBg: 'bg-red-500/20',     iconText: 'text-red-400'     },
  { icon: HandCoins,     borderColor: '#10b981', iconBg: 'bg-emerald-500/20', iconText: 'text-emerald-400' },
]

function TrendBadge({ trend }: { trend: Trend }) {
  if (trend.direction === 'flat') return null
  const isUp = trend.direction === 'up'
  const Icon = isUp ? TrendingUp : TrendingDown
  return (
    <span
      className={`flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isUp ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}
      title={`${isUp ? '+' : '-'}${trend.pct}% vs last week`}
    >
      <Icon className="h-3 w-3" />
      {trend.pct}%
    </span>
  )
}

function StatCard({ label, value, cfg, to, trend }:
  { label: string; value: number; cfg: StatCardConfig; to?: string; trend?: Trend }) {
  const Icon = cfg.icon
  const inner = (
    <div
      className={`bg-[#1a1a2e] border border-white/[0.08] rounded-xl shadow-sm p-4 h-full ${to ? 'transition-all duration-200 hover:border-white/20' : ''}`}
      style={{ borderLeft: `4px solid ${cfg.borderColor}` }}
    >
      <div className={`w-10 h-10 rounded-full ${cfg.iconBg} flex items-center justify-center mb-3`}>
        <Icon className={`h-4 w-4 ${cfg.iconText}`} />
      </div>
      <p className="text-3xl font-bold text-slate-100 stat-num leading-none">{value}</p>
      <div className="flex items-center justify-between mt-1.5">
        <p className="text-sm text-slate-400">{label}</p>
        {trend && <TrendBadge trend={trend} />}
      </div>
    </div>
  )
  if (to) return <Link to={to} className="block">{inner}</Link>
  return inner
}

// ── SVG Conversion ring ────────────────────────────────────────────────────────

function ConversionRing({ rate }: { rate: number }) {
  const R = 36, C = 2 * Math.PI * R
  const offset = C - (Math.min(rate, 100) / 100) * C
  return (
    <div className="relative w-24 h-24 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 88 88">
        <defs>
          <linearGradient id="ringGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor="#6366f1" />
            <stop offset="50%"  stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
          <filter id="ringGlow">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="rgba(99,102,241,0.6)" />
          </filter>
        </defs>
        <circle cx="44" cy="44" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
        <circle
          cx="44" cy="44" r={R} fill="none" stroke="url(#ringGradient)" strokeWidth="8"
          strokeDasharray={C} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease', filter: 'url(#ringGlow)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="stat-num" style={{ color: '#f1f5f9', fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1 }}>
          {rate}%
        </span>
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '2px' }}>
          placed
        </span>
      </div>
    </div>
  )
}

// ── Performance sidebar ────────────────────────────────────────────────────────

function PerformanceSidebar({ data, loading }: { data: ScorecardData | undefined; loading: boolean }) {
  const stats    = data?.stats
  const pipeline = data?.pipeline ?? []
  const places   = data?.recent_placements ?? []
  const maxPipe  = Math.max(...pipeline.map(r => r.count), 1)

  return (
    <div className="panel-card col-span-4 p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-violet-500/10 rounded-lg">
          <Trophy className="h-4 w-4 text-violet-400" />
        </div>
        <span style={{ color: '#c4b5fd', fontWeight: 700, fontSize: '13px' }}>My Performance</span>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="w-24 h-24 rounded-full bg-white/10 animate-pulse mx-auto" />
          {[1,2,3].map(i => <div key={i} className="h-3 bg-white/10 rounded animate-pulse" />)}
        </div>
      ) : (
        <>
          {/* Conversion ring */}
          <div className="space-y-1">
            <ConversionRing rate={stats?.conversion_rate ?? 0} />
            <p className="text-center" style={{ color: 'rgba(255,255,255,0.25)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Placement Rate</p>
          </div>

          {/* Mini stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Total',  value: stats?.total  ?? 0, bg: 'bg-white/5'        },
              { label: 'Active', value: stats?.active ?? 0, bg: 'bg-indigo-500/10'  },
              { label: 'Placed', value: stats?.placed ?? 0, bg: 'bg-emerald-500/10' },
            ].map(s => (
              <div key={s.label} className={`${s.bg} rounded-xl p-2.5 text-center`}>
                <p className="stat-num" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'white', lineHeight: 1 }}>{s.value}</p>
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '9px', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: '3px' }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Pipeline mini bars */}
          {pipeline.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Pipeline</p>
              {pipeline.map(row => (
                <div key={row.stage}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400 truncate max-w-[80%]">{row.stage}</span>
                    <span className="text-slate-500 font-medium">{row.count}</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round((row.count / maxPipe) * 100)}%`,
                        background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                        transition: 'width 0.6s ease',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recent placements */}
          {places.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Recent Placements</p>
              {places.map((p, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-emerald-400">
                      {p.candidate.charAt(0)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-200 truncate">{p.candidate}</p>
                    <p className="text-[10px] text-slate-500 truncate">{p.job}</p>
                  </div>
                  <span className="text-[10px] text-slate-500 shrink-0">{fmtDate(p.placed_at)}</span>
                </div>
              ))}
            </div>
          )}

          {pipeline.length === 0 && places.length === 0 && (
            <div className="text-center py-2 space-y-2">
              <p className="text-xs text-slate-500">No activity yet</p>
              <Link
                to="/candidates"
                style={{
                  display:         'inline-block',
                  background:      'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.2))',
                  color:           '#a5b4fc',
                  border:          '1px solid rgba(99,102,241,0.35)',
                  borderRadius:    '10px',
                  padding:         '8px 16px',
                  fontSize:        '12px',
                  fontWeight:      600,
                  boxShadow:       '0 4px 12px rgba(99,102,241,0.2)',
                  textDecoration:  'none',
                }}
              >
                Add a candidate →
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Today's Schedule ──────────────────────────────────────────────────────

const INTERVIEW_TYPE_LABEL: Record<string, string> = {
  phone:     'Phone Screen',
  video:     'Video',
  onsite:    'On-site',
  technical: 'Technical',
  panel:     'Panel',
}

const INTERVIEW_TYPE_BADGE: Record<string, string> = {
  phone:     'bg-slate-500/15 text-slate-300',
  video:     'bg-violet-500/15 text-violet-300',
  onsite:    'bg-blue-500/15 text-blue-300',
  technical: 'bg-amber-500/15 text-amber-300',
  panel:     'bg-violet-500/15 text-violet-300',
}

function InterviewTypeBadge({ type }: { type: string }) {
  const cls = INTERVIEW_TYPE_BADGE[type] ?? 'bg-slate-500/15 text-slate-300'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0 ${cls}`}>
      {INTERVIEW_TYPE_LABEL[type] ?? type}
    </span>
  )
}

function TodaySchedulePanel({ interviews }: { interviews: InterviewToday[] }) {
  return (
    <div className="panel-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="p-1.5 bg-indigo-500/15 rounded-lg">
          <CalendarDays className="h-4 w-4 text-indigo-400" />
        </div>
        <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '13px' }}>Today's Schedule</span>
        {interviews.length > 0 && (
          <span className="ml-auto text-xs text-slate-500">
            {interviews.length} interview{interviews.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {interviews.length === 0 ? (
        <div className="px-4 py-6 text-center space-y-1.5">
          <CalendarDays className="h-5 w-5 mx-auto text-slate-600" />
          <p className="text-sm text-slate-500">No interviews today</p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {interviews.map(i => {
            const time = new Date(i.scheduled_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
            return (
              <div key={i.id} className="flex items-stretch gap-3 px-4 py-3">
                <div className="w-0.5 rounded-full bg-violet-500/60 flex-shrink-0" />
                <p className="text-xs font-bold text-slate-300 w-10 flex-shrink-0 tabular-nums self-center">{time}</p>
                <div className="min-w-0 flex-1 self-center">
                  <p className="text-sm font-medium text-slate-100 truncate">{i.candidate_name}</p>
                  <p className="text-xs text-slate-500 truncate">{i.job_title}</p>
                </div>
                <InterviewTypeBadge type={i.interview_type} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Upcoming Deadlines ────────────────────────────────────────────────────

function DeadlineDayBadge({ days }: { days: number }) {
  const text  = days === 0 ? 'Today' : `${days}d`
  const color = days === 0 ? 'text-red-400' : days <= 2 ? 'text-orange-400' : 'text-amber-400'
  return <span className={`text-xs font-bold flex-shrink-0 ${color}`}>{text}</span>
}

function UpcomingDeadlinesPanel({ deadlines }: { deadlines: DashboardData['upcoming_deadlines'] }) {
  const { jobs_due_soon, offers_expiring_soon } = deadlines
  const isEmpty = jobs_due_soon.length === 0 && offers_expiring_soon.length === 0

  return (
    <div className="panel-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="p-1.5 bg-amber-500/15 rounded-lg">
          <Clock className="h-4 w-4 text-amber-400" />
        </div>
        <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '13px' }}>Upcoming Deadlines</span>
      </div>

      {isEmpty ? (
        <EmptyState
          icon={CalendarCheck}
          title="No upcoming deadlines"
          description="No jobs or offers expiring this week."
        />
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {jobs_due_soon.map(j => (
            <Link key={`job-${j.id}`} to={`/jobs/${j.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <Briefcase className="h-3.5 w-3.5 text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-100 truncate">{j.title}</p>
                <p className="text-xs text-slate-500 truncate">{j.client_name}</p>
              </div>
              <DeadlineDayBadge days={j.days_left} />
            </Link>
          ))}
          {offers_expiring_soon.map(o => (
            <Link key={`offer-${o.id}`} to="/offers"
              className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <HandCoins className="h-3.5 w-3.5 text-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-100 truncate">{o.candidate_name}</p>
                <p className="text-xs text-slate-500 truncate">Offer expiring · {o.job_title}</p>
              </div>
              <DeadlineDayBadge days={o.days_left} />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Task Panel ────────────────────────────────────────────────────────────────

interface TaskItem {
  id: number
  title: string
  due_date: string | null
  status: string
  related_candidate: number | null
  candidate_name: string | null
  related_job: number | null
  job_title: string | null
}

interface PaginatedTasks { count: number; results: TaskItem[] }

function isOverdue(due: string | null) {
  if (!due) return false
  return new Date(due) < new Date(new Date().toDateString())
}

function AddTaskDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<{
    title: string; due_date?: string
  }>()

  const create = useMutation({
    mutationFn: (data: object) => api.post('/tasks/', data).then(r => r.data),
    onSuccess: () => { reset(); setOpen(false); onAdded() },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="gap-1.5 h-7 text-xs text-white border-none"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: '9px', boxShadow: '0 4px 12px rgba(99,102,241,0.4)' }}
        >
          <Plus className="h-3 w-3" /> Add Task
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Add Task</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(v => create.mutateAsync(v))} className="space-y-3">
          <div className="space-y-1">
            <Label>Title *</Label>
            <Input {...register('title', { required: true })} placeholder="e.g. Follow up with Alice" />
          </div>
          <div className="space-y-1">
            <Label>Due date <span className="text-slate-500 font-normal">(optional)</span></Label>
            <Input {...register('due_date')} type="date" />
          </div>
          {create.isError && (
            <p className="text-xs text-red-500">Failed to create task.</p>
          )}
          <div className="flex justify-end pt-1">
            <Button type="submit" size="sm" disabled={isSubmitting || create.isPending}>
              {create.isPending ? 'Saving…' : 'Add Task'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TaskPanel() {
  const qc = useQueryClient()
  const [collapsed, setCollapsed] = useState(false)

  const { data, isLoading } = useQuery<PaginatedTasks>({
    queryKey: ['tasks', 'open'],
    queryFn: () => api.get('/tasks/', { params: { status: 'open', page_size: 50 } }).then(r => r.data),
  })

  const markDone = useMutation({
    mutationFn: (id: number) => api.patch(`/tasks/${id}/`, { status: 'done' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })

  const tasks = data?.results ?? []
  const overdueCount = tasks.filter(t => isOverdue(t.due_date)).length

  return (
    <div className="panel-card overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-500/15 rounded-lg">
            <ListTodo className="h-4 w-4 text-indigo-400" />
          </div>
          <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '13px' }}>My Tasks</span>
          {overdueCount > 0 && (
            <StatusBadge status="overdue" />
          )}
          {tasks.length > 0 && overdueCount === 0 && (
            <span className="text-xs text-slate-500">{tasks.length} open</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <AddTaskDialog onAdded={() => qc.invalidateQueries({ queryKey: ['tasks'] })} />
          <button onClick={() => setCollapsed(c => !c)} className="text-white/35 hover:text-white/65 transition-colors">
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div>
          {isLoading && (
            <p className="px-4 py-4 text-sm text-slate-500">Loading…</p>
          )}
          {!isLoading && tasks.length === 0 && (
            <EmptyState
              icon={CheckSquare}
              title="You're all caught up"
              description="No open tasks right now."
            />
          )}
          {tasks.map(task => (
            <div key={task.id}
              className={`flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] last:border-0 ${isOverdue(task.due_date) ? 'bg-red-500/5' : ''}`}
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded cursor-pointer"
                style={{ accentColor: '#6366f1' }}
                onChange={() => markDone.mutate(task.id)}
              />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${isOverdue(task.due_date) ? 'text-red-400' : 'text-slate-200'}`}>
                  {task.title}
                </p>
                {(task.candidate_name || task.job_title) && (
                  <p className="text-xs text-slate-500 truncate">
                    {[task.candidate_name, task.job_title].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              {task.due_date && (
                <span className={`text-xs font-medium shrink-0 ${isOverdue(task.due_date) ? 'text-red-400' : 'text-slate-500'}`}>
                  {isOverdue(task.due_date) ? 'Overdue · ' : ''}{new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Conversion Funnel ─────────────────────────────────────────────────────────

interface FunnelStage { stage: string; count: number }

const FUNNEL_COLORS = [
  '#6366f1', // Sourced
  '#7c3aed', // Screened
  '#8b5cf6', // Submitted
  '#a855f7', // Shortlisted
  '#06b6d4', // L1 Interview
  '#0ea5e9', // L2 Interview
  '#f59e0b', // Offer Released
  '#10b981', // Offer Accepted
  '#22c55e', // Joined
]

function ConversionFunnel({ stages, loading, error }: {
  stages: FunnelStage[]
  loading: boolean
  error: boolean
}) {
  const max      = stages[0]?.count ?? 1
  const last     = stages[stages.length - 1]
  const endToEnd = max > 0 && last ? Math.round((last.count / max) * 100) : 0

  return (
    <div className="panel-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg" style={{ background: 'rgba(139,92,246,0.12)' }}>
            <Filter className="h-4 w-4 text-violet-400" />
          </div>
          <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '13px' }}>Conversion Funnel</span>
        </div>
        {!loading && !error && stages.length > 0 && (
          <span className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            <span style={{ color: '#a78bfa', fontWeight: 600 }}>{endToEnd}%</span> end-to-end conversion
          </span>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2.5">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-28 h-3 rounded animate-pulse shrink-0" style={{ background: 'rgba(255,255,255,0.08)' }} />
              <div className="flex-1 h-5 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.06)', maxWidth: `${Math.max(15, 90 - i * 9)}%` }} />
              <div className="w-8 h-3 rounded animate-pulse shrink-0" style={{ background: 'rgba(255,255,255,0.08)' }} />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <p className="text-sm py-4 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Could not load funnel data
        </p>
      )}

      {/* Empty state */}
      {!loading && !error && stages.length === 0 && (
        <p className="text-sm py-4 text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
          No data yet
        </p>
      )}

      {/* Funnel rows */}
      {!loading && !error && stages.length > 0 && (
        <div>
          {stages.map((s, i) => {
            const barPct  = max > 0 ? (s.count / max) * 100 : 0
            const prev    = i > 0 ? stages[i - 1].count : null
            const convPct = prev != null && prev > 0
              ? Math.round((s.count / prev) * 100)
              : null
            const color   = FUNNEL_COLORS[i] ?? '#6366f1'
            const isEmpty = s.count === 0

            return (
              <div key={s.stage}>
                <div className="flex items-center gap-3 py-1">
                  {/* Stage label */}
                  <span className="w-28 shrink-0 text-right text-xs font-medium leading-none"
                    style={{ color: isEmpty ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.55)' }}>
                    {s.stage}
                  </span>

                  {/* Bar track */}
                  <div className="flex-1 h-6 rounded overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    {isEmpty ? (
                      /* Dashed empty state bar */
                      <div className="h-full flex items-center px-2">
                        <div className="h-px w-full" style={{ background: 'rgba(255,255,255,0.08)', borderTop: '1px dashed rgba(255,255,255,0.12)' }} />
                      </div>
                    ) : (
                      <div
                        className="h-full rounded"
                        style={{
                          width: `${Math.max(barPct, 2)}%`,
                          background: color,
                          opacity: 0.8,
                          transition: 'width 0.7s ease',
                          boxShadow: `0 0 8px ${color}40`,
                        }}
                      />
                    )}
                  </div>

                  {/* Count */}
                  <span className="w-10 shrink-0 text-right text-sm font-bold stat-num"
                    style={{ color: isEmpty ? 'rgba(255,255,255,0.2)' : '#f1f5f9' }}>
                    {s.count}
                  </span>
                </div>

                {/* Conversion rate between stages */}
                {convPct !== null && (
                  <div className="flex items-center gap-3" style={{ height: '14px' }}>
                    <div className="w-28 shrink-0" />
                    <div className="flex items-center gap-1.5 pl-3">
                      <div className="w-px h-3.5" style={{ background: 'rgba(255,255,255,0.08)' }} />
                      <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', lineHeight: 1 }}>
                        {convPct}% passed
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth()

  const { data, isLoading, isError } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn:  () => api.get('/dashboard/my-day/').then(r => r.data),
    refetchInterval: 60_000,
  })

  const isCEO = user?.role === 'ceo'

  const { data: scorecard, isLoading: scLoading } = useQuery<ScorecardData>({
    queryKey: ['scorecard'],
    queryFn:  () => api.get('/dashboard/scorecard/').then(r => r.data),
    enabled:  !isCEO,
  })

  const { data: funnelData, isLoading: funnelLoading, isError: funnelError } = useQuery<{ stages: FunnelStage[] }>({
    queryKey: ['conversion-funnel'],
    queryFn:  () => api.get('/dashboard/conversion-funnel/').then(r => r.data),
    retry: 1,
  })

  if (isLoading) return <DashboardSkeleton />

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-red-500">Failed to load dashboard. Please refresh.</p>
      </div>
    )
  }

  const { summary } = data

  const t = summary.trends
  const STAT_CARDS = [
    { label: 'Open Jobs',         value: summary.open_jobs_count,         cfg: STAT_CARD_STYLES[0], to: '/jobs',                trend: t?.open_jobs        },
    { label: 'Active Submittals', value: summary.active_submittals_count, cfg: STAT_CARD_STYLES[1], to: '/submittals',          trend: t?.active_submittals },
    { label: 'Urgent Jobs',       value: summary.urgent_jobs_count,       cfg: STAT_CARD_STYLES[2], to: '/jobs?priority=urgent', trend: t?.urgent_jobs     },
    { label: 'Overdue Jobs',      value: summary.overdue_jobs_count,      cfg: STAT_CARD_STYLES[3], to: '/jobs?filter=overdue', trend: t?.overdue_jobs      },
    { label: 'Pending Offers',    value: summary.pending_offers_count,    cfg: STAT_CARD_STYLES[4], to: '/offers',              trend: t?.pending_offers    },
  ]

  return (
    <div className="space-y-5">

      {/* ── Greeting hero card ── */}
      <div
        className="relative overflow-hidden"
        style={{
          background:   'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px) 0 0 / 22px 22px, linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 50%, rgba(6,182,212,0.06) 100%)',
          border:       '1px solid rgba(99,102,241,0.2)',
          borderRadius: '14px',
          padding:      '14px 20px',
          boxShadow:    '0 0 40px rgba(99,102,241,0.08)',
        }}
      >
        {/* Decorative gradient blob — sits behind content */}
        <div
          className="absolute pointer-events-none z-0"
          style={{
            top:          '-40px',
            right:        0,
            width:        '200px',
            height:       '200px',
            borderRadius: '50%',
            background:   'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
          }}
        />

        {/* Content layer */}
        <div className="relative z-10 space-y-1">
          <h1 style={{
            fontSize:      '1.1rem',
            fontWeight:    700,
            color:         '#f1f5f9',
            letterSpacing: '-0.5px',
            textShadow:    '0 0 30px rgba(99,102,241,0.3)',
          }}>
            {greeting(user?.first_name ?? 'there')}
          </h1>
          <p className="flex items-center gap-1.5" style={{ color: 'rgba(241,245,249,0.45)', fontSize: '12px', fontWeight: 400 }}>
            <CalendarDays className="h-3 w-3" />
            {todayLabel()}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            {summary.urgent_jobs_count > 0
              ? <StatusPill label={`${summary.urgent_jobs_count} urgent job${summary.urgent_jobs_count > 1 ? 's' : ''} need attention`} color="red" to="/jobs?priority=urgent" />
              : <StatusPill label="No urgent jobs" color="red" />}
            <StatusPill label={`${summary.active_submittals_count} active submittal${summary.active_submittals_count !== 1 ? 's' : ''}`} color="purple" to="/submittals" />
            {summary.interviews_today_count > 0
              ? <StatusPill label={`${summary.interviews_today_count} interview${summary.interviews_today_count > 1 ? 's' : ''} today`} color="cyan" to="/interviews" />
              : <StatusPill label="No interviews today" color="cyan" />}
          </div>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-12 gap-4">
        {STAT_CARDS.map(s => (
          <div key={s.label} className="col-span-4">
            <StatCard label={s.label} value={s.value} cfg={s.cfg} to={s.to} trend={s.trend} />
          </div>
        ))}
      </div>

      {/* ── Section divider ── */}
      <div style={{
        width:      '100%',
        height:     '1px',
        margin:     '4px 0',
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)',
      }} />

      {/* ── Conversion Funnel ── */}
      <ConversionFunnel stages={funnelData?.stages ?? []} loading={funnelLoading} error={funnelError} />

      {/* ── Main content: performance + schedule + deadlines + tasks ── */}
      <div className="grid grid-cols-12 gap-4">

        {/* Performance sidebar — hidden for CEO */}
        {!isCEO && <PerformanceSidebar data={scorecard} loading={scLoading} />}

        {/* Schedule — 6 cols when CEO (full width split), 4 when performance is visible */}
        <div className={isCEO ? 'col-span-6' : 'col-span-4'}>
          <TodaySchedulePanel interviews={data.interviews_today} />
        </div>

        {/* Deadlines */}
        <div className={isCEO ? 'col-span-6' : 'col-span-4'}>
          <UpcomingDeadlinesPanel deadlines={data.upcoming_deadlines} />
        </div>

        {/* Tasks — always full width */}
        <div className="col-span-12">
          <TaskPanel />
        </div>

      </div>

    </div>
  )
}
