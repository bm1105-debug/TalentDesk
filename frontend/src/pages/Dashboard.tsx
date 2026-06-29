// Dashboard — "My Day" with Syncfusion-style hiring overview charts.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import {
  Briefcase, FileText, AlertTriangle, Clock,
  HandCoins, CalendarDays, Trophy, ArrowRight,
  ListTodo, Plus, ChevronDown, ChevronUp,
  CheckSquare, CalendarCheck, Filter,
  Building2, X,
} from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'
import api from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/StatusBadge'
import type { TimeToFillTrend, DeclineReasons, Diversity, SourceEntry } from '@/components/analytics/Widgets'
import {
  WidgetCard, SourceBar, TimeToFillTrendWidget, DeclineReasonsWidget, DiversityWidget, Empty,
} from '@/components/analytics/Widgets'

// ── Types ──────────────────────────────────────────────────────────────────────

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

interface HiringKpis {
  avg_time_to_fill_days: number | null
  offers_provided: number
  offers_accepted: number
  acceptance_rate: number | null
  shortlisted_count: number
  rejected_count: number
}

interface ClientItem {
  id: number
  name: string
}

interface DashboardAnalytics {
  source_effectiveness: SourceEntry[] | null
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

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      {/* Greeting hero */}
      <div className="h-20 rounded-xl bg-white/5 animate-pulse" />
      {/* Client filter bar */}
      <div className="h-12 rounded-xl bg-white/5 animate-pulse" />
      {/* 6 KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-white/5 animate-pulse" />
        ))}
      </div>
      {/* Funnel | Trend */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="panel-card h-64 animate-pulse" />
        <div className="panel-card h-64 animate-pulse" />
      </div>
      {/* Source | Decline */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="panel-card h-48 animate-pulse" />
        <div className="panel-card h-48 animate-pulse" />
      </div>
      {/* Diversity */}
      <div className="panel-card h-48 animate-pulse" />
      {/* Bottom grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="panel-card md:col-span-4 h-56 animate-pulse" />
        <div className="panel-card md:col-span-4 h-56 animate-pulse" />
        <div className="panel-card md:col-span-4 h-56 animate-pulse" />
        <div className="panel-card md:col-span-12 h-32 animate-pulse" />
      </div>
    </div>
  )
}

// ── Status pills ───────────────────────────────────────────────────────────────

const PILL_STYLES: Record<'red' | 'purple' | 'cyan' | 'orange', string> = {
  red:    'bg-red-500/15   border-red-500/25   text-red-200',
  purple: 'bg-blue-500/15  border-blue-500/25  text-blue-200',
  cyan:   'bg-blue-400/15  border-blue-400/25  text-blue-200',
  orange: 'bg-amber-500/15 border-amber-500/25 text-amber-200',
}

function StatusPill({ label, color, to }: { label: string; color: 'red' | 'purple' | 'cyan' | 'orange'; to?: string }) {
  const colorCls = PILL_STYLES[color]
  const base = `inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full border transition-colors whitespace-nowrap ${colorCls}`
  if (to) return (
    <Link to={to} className={`${base} hover:brightness-125 cursor-pointer`}>
      {label}
      <ArrowRight className="h-3 w-3" aria-hidden="true" />
    </Link>
  )
  return <span className={base}>{label}</span>
}

// ── Hiring KPI tiles ───────────────────────────────────────────────────────────

interface HiringKpiConfig {
  icon: React.ElementType
  borderColor: string
  iconBg: string
  iconText: string
  suffix?: string
}

const HIRING_KPI_CONFIGS: HiringKpiConfig[] = [
  { icon: Clock,         borderColor: '#2563eb', iconBg: 'bg-blue-500/20', iconText: 'text-blue-400', suffix: 'd' },
  { icon: Trophy,        borderColor: '#3b82f6', iconBg: 'bg-blue-500/20', iconText: 'text-blue-400', suffix: '%' },
  { icon: HandCoins,     borderColor: '#2563eb', iconBg: 'bg-blue-500/20', iconText: 'text-blue-400'              },
  { icon: CheckSquare,   borderColor: '#60a5fa', iconBg: 'bg-blue-400/20', iconText: 'text-blue-300'              },
  { icon: FileText,      borderColor: '#3b82f6', iconBg: 'bg-blue-500/20', iconText: 'text-blue-400'              },
  { icon: AlertTriangle, borderColor: '#1d4ed8', iconBg: 'bg-blue-700/20', iconText: 'text-blue-500'              },
]

function HiringKpiTile({ label, value, cfg, loading }: {
  label: string
  value: number | null | undefined
  cfg: HiringKpiConfig
  loading?: boolean
}) {
  const Icon = cfg.icon
  return (
    <div style={{
      padding: '14px 16px', height: '96px', display: 'flex', flexDirection: 'column',
      justifyContent: 'space-between', borderRadius: '8px',
      background: `linear-gradient(135deg, ${cfg.borderColor}12 0%, rgba(255,255,255,0.018) 100%)`,
      border: '1px solid rgba(255,255,255,0.07)', borderLeft: `3px solid ${cfg.borderColor}`,
      boxShadow: `0 2px 12px ${cfg.borderColor}18`,
    }}>
      <div className={`${cfg.iconBg} flex items-center justify-center`}
        style={{ width: 32, height: 32, borderRadius: 7 }}>
        <Icon className={`h-4 w-4 ${cfg.iconText}`} />
      </div>
      {loading ? (
        <div className="space-y-1">
          <div className="h-6 w-12 bg-white/10 rounded animate-pulse" />
          <div className="h-2.5 w-20 bg-white/10 rounded animate-pulse" />
        </div>
      ) : (
        <div>
          <p className="stat-num" style={{
            fontSize: value == null ? '16px' : '28px', fontWeight: 800, lineHeight: 1, letterSpacing: '-0.5px',
            color: value == null ? 'rgba(255,255,255,0.4)' : '#f1f5f9',
          }}>
            {value == null ? 'No data' : `${value}${cfg.suffix ?? ''}`}
          </p>
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '3px' }}>{label}</p>
        </div>
      )}
    </div>
  )
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
            <stop offset="0%"   stopColor="#1d4ed8" />
            <stop offset="50%"  stopColor="#2563eb" />
            <stop offset="100%" stopColor="#60a5fa" />
          </linearGradient>
          <filter id="ringGlow">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="rgba(37,99,235,0.7)" />
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
    <div className="panel-card md:col-span-4 p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-blue-500/10 rounded-lg">
          <Trophy className="h-4 w-4 text-blue-400" />
        </div>
        <span style={{ color: '#93c5fd', fontWeight: 700, fontSize: '13px' }}>My Performance</span>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="w-24 h-24 rounded-full bg-white/10 animate-pulse mx-auto" />
          {[1, 2, 3].map(i => <div key={i} className="h-3 bg-white/10 rounded animate-pulse" />)}
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
              { label: 'Active', value: stats?.active ?? 0, bg: 'bg-blue-500/10'  },
              { label: 'Placed', value: stats?.placed ?? 0, bg: 'bg-blue-600/10' },
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
                        background: 'linear-gradient(90deg, #1d4ed8, #3b82f6)',
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
                  <div className="w-7 h-7 rounded-full bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-blue-400">
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
                  background:      'linear-gradient(135deg, rgba(37,99,235,0.25), rgba(59,130,246,0.18))',
                  color:           '#93c5fd',
                  border:          '1px solid rgba(37,99,235,0.35)',
                  borderRadius:    '10px',
                  padding:         '8px 16px',
                  fontSize:        '12px',
                  fontWeight:      600,
                  boxShadow:       '0 4px 12px rgba(37,99,235,0.2)',
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
  video:     'bg-blue-500/15 text-blue-300',
  onsite:    'bg-blue-500/15 text-blue-300',
  technical: 'bg-amber-500/15 text-amber-300',
  panel:     'bg-blue-500/15 text-blue-300',
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
        <div className="p-1.5 bg-blue-500/15 rounded-lg">
          <CalendarDays className="h-4 w-4 text-blue-400" />
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
          <CalendarDays className="h-5 w-5 mx-auto text-blue-400/50" />
          <p className="text-sm text-slate-500">No interviews today</p>
        </div>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {interviews.map(i => {
            const time = new Date(i.scheduled_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
            return (
              <div key={i.id} className="flex items-stretch gap-3 px-4 py-3">
                <div className="w-0.5 rounded-full bg-blue-500/60 flex-shrink-0" />
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
        <div className="p-1.5 bg-blue-500/15 rounded-lg">
          <Clock className="h-4 w-4 text-blue-400" />
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
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <Briefcase className="h-3.5 w-3.5 text-blue-400" />
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
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <HandCoins className="h-3.5 w-3.5 text-blue-400" />
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
          style={{ background: 'linear-gradient(135deg, #1d4ed8, #2563eb)', borderRadius: '9px', boxShadow: '0 4px 12px rgba(37,99,235,0.4)' }}
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
  const { isAuthenticated } = useAuth()
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
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-500/15 rounded-lg">
            <ListTodo className="h-4 w-4 text-blue-400" />
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
          {isAuthenticated && <AddTaskDialog onAdded={() => qc.invalidateQueries({ queryKey: ['tasks'] })} />}
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
                style={{ accentColor: '#2563eb' }}
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
  '#1d4ed8',
  '#2563eb',
  '#3b82f6',
  '#4f8ef7',
  '#60a5fa',
  '#7bb8fb',
  '#93c5fd',
  '#a8d4fe',
  '#bfdbfe',
]

function ConversionFunnel({ stages, loading, error }: {
  stages: FunnelStage[]
  loading: boolean
  error: boolean
}) {
  const max      = stages[0]?.count ?? 1
  const last     = stages[stages.length - 1]
  const endToEnd = max > 0 && last ? Math.round((last.count / max) * 100) : 0

  const bottleneckIdx = (() => {
    if (stages.length < 2) return -1
    let minPct = Infinity, minIdx = -1
    for (let i = 1; i < stages.length; i++) {
      if (stages[i - 1].count > 0) {
        const pct = Math.round((stages[i].count / stages[i - 1].count) * 100)
        if (pct < minPct) { minPct = pct; minIdx = i }
      }
    }
    return minIdx
  })()

  return (
    <div className="panel-card" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <div style={{ background: 'rgba(37,99,235,0.12)', padding: '5px', borderRadius: '7px', display: 'flex' }}>
            <Filter style={{ width: 14, height: 14, color: '#60a5fa' }} />
          </div>
          <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '13px' }}>Hiring Pipeline Funnel</span>
        </div>
        {!loading && !error && stages.length > 0 && (
          <span style={{
            background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.25)',
            borderRadius: '5px', padding: '2px 8px', fontSize: '11px', color: '#60a5fa', fontWeight: 600,
          }}>
            {endToEnd}% end-to-end
          </span>
        )}
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} style={{
              height: '20px', borderRadius: '3px', background: 'rgba(255,255,255,0.06)',
              width: `${Math.max(20, 100 - i * 9)}%`, margin: '0 auto', animation: 'pulse 2s infinite',
            }} />
          ))}
        </div>
      )}

      {!loading && error && (
        <p style={{ fontSize: '13px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: '16px 0' }}>
          Could not load funnel data
        </p>
      )}

      {!loading && !error && stages.length === 0 && (
        <p style={{ fontSize: '13px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', padding: '16px 0' }}>
          No data yet
        </p>
      )}

      {!loading && !error && stages.length > 0 && (
        <div>
          {stages.map((s, i) => {
            const pct     = max > 0 ? Math.max(6, (s.count / max) * 100) : 100
            const color   = FUNNEL_COLORS[i] ?? '#2563eb'
            const prev    = stages[i - 1]
            const convPct = prev && prev.count > 0
              ? Math.round((s.count / prev.count) * 100)
              : null

            return (
              <div key={s.stage}>
                {convPct !== null && (
                  <div style={{ height: '6px', display: 'flex', alignItems: 'center', gap: '5px', paddingLeft: '94px' }}>
                    <div style={{ width: '1px', height: '6px', background: 'rgba(255,255,255,0.07)' }} />
                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.22)', lineHeight: 1 }}>
                      ↓ {convPct}%
                    </span>
                  </div>
                )}

                <div style={{
                  height: '24px', display: 'flex', alignItems: 'center', gap: '8px',
                  ...(i === bottleneckIdx ? { borderLeft: '3px solid #f97316', paddingLeft: '8px', marginLeft: '-11px' } : {}),
                }}>
                  <span style={{
                    width: '86px', flexShrink: 0, textAlign: 'right',
                    fontSize: '12px', color: i === bottleneckIdx ? '#fb923c' : 'rgba(255,255,255,0.45)', lineHeight: 1,
                  }}>
                    {s.stage}
                    {i === bottleneckIdx && (
                      <span style={{
                        marginLeft: '4px', fontSize: '8px', fontWeight: 700, letterSpacing: '0.08em',
                        textTransform: 'uppercase', color: '#f97316',
                        background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.25)',
                        borderRadius: '3px', padding: '1px 4px',
                      }}>▼</span>
                    )}
                  </span>

                  <div style={{ flex: 1, position: 'relative', height: '14px', background: 'rgba(255,255,255,0.04)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{
                      position: 'absolute',
                      left:     `${(100 - pct) / 2}%`,
                      width:    `${pct}%`,
                      height:   '100%',
                      background: color,
                      opacity:  0.8,
                      borderRadius: '2px',
                      boxShadow: `0 0 5px ${color}55`,
                      transition: 'width 0.5s ease, left 0.5s ease',
                    }} />
                  </div>

                  <span style={{
                    width: '30px', flexShrink: 0, textAlign: 'right',
                    fontSize: '13px', fontWeight: 700, color: '#f1f5f9', lineHeight: 1,
                  }}>
                    {s.count}
                  </span>
                </div>
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
  const { user, isAuthenticated } = useAuth()
  const [selectedClient, setSelectedClient] = useState<number | null>(null)

  const { data: clients = [], isLoading: clientsLoading } = useQuery<ClientItem[]>({
    queryKey: ['clients-simple'],
    queryFn: () =>
      api.get('/clients/', { params: { page_size: 200 } }).then(r =>
        Array.isArray(r.data) ? r.data : r.data.results
      ),
  })

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
    queryKey: ['conversion-funnel', selectedClient],
    queryFn:  () => api.get('/dashboard/conversion-funnel/', { params: clientParam }).then(r => r.data),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  const clientParam = selectedClient ? { client: selectedClient } : {}

  const { data: kpis, isLoading: kpisLoading } = useQuery<HiringKpis>({
    queryKey: ['hiring-kpis', selectedClient],
    queryFn:  () => api.get('/dashboard/hiring-kpis/', { params: clientParam }).then(r => r.data),
  })

  const { data: trendData, isLoading: trendLoading } = useQuery<TimeToFillTrend>({
    queryKey: ['time-to-fill-trend', selectedClient],
    queryFn:  () => api.get('/dashboard/time-to-fill-trend/', { params: clientParam }).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn:  () => api.get('/dashboard/analytics/').then(r => r.data),
    select:   (data): DashboardAnalytics => ({ source_effectiveness: data.source_effectiveness }),
    staleTime: 5 * 60 * 1000,
  })

  const { data: declineData, isLoading: declineLoading } = useQuery<DeclineReasons>({
    queryKey: ['decline-reasons', selectedClient],
    queryFn:  () => api.get('/dashboard/decline-reasons/', { params: clientParam }).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const { data: diversityData, isLoading: diversityLoading } = useQuery<Diversity>({
    queryKey: ['diversity', selectedClient],
    queryFn:  () => api.get('/dashboard/diversity/', { params: clientParam }).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const sources = analyticsData?.source_effectiveness ?? []
  const maxCandidates = sources.length > 0 ? Math.max(...sources.map(s => s.candidates)) : 1
  const selectedClientName = clients.find(c => c.id === selectedClient)?.name

  if (!isAuthenticated) return (
    <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
      <Briefcase className="h-10 w-10 text-blue-400/40" />
      <p className="text-lg font-semibold text-slate-300">Sign in to see your dashboard</p>
      <p className="text-sm text-slate-500 max-w-xs">Your personal pipeline, tasks, and hiring stats are visible once you're signed in.</p>
      <Link to="/login" className="mt-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
        Sign In
      </Link>
    </div>
  )

  if (isLoading) return <DashboardSkeleton />

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-red-500">Failed to load dashboard. Please refresh.</p>
      </div>
    )
  }

  const { summary } = data

  const HIRING_KPIS = [
    { label: 'Avg Time to Fill', value: kpis?.avg_time_to_fill_days, cfg: HIRING_KPI_CONFIGS[0] },
    { label: 'Acceptance Rate',  value: kpis?.acceptance_rate,       cfg: HIRING_KPI_CONFIGS[1] },
    { label: 'Offers Provided',  value: kpis?.offers_provided,       cfg: HIRING_KPI_CONFIGS[2] },
    { label: 'Offers Accepted',  value: kpis?.offers_accepted,       cfg: HIRING_KPI_CONFIGS[3] },
    { label: 'Shortlisted',      value: kpis?.shortlisted_count,     cfg: HIRING_KPI_CONFIGS[4] },
    { label: 'Rejected',         value: kpis?.rejected_count,        cfg: HIRING_KPI_CONFIGS[5] },
  ]

  return (
    <div className="space-y-4">

      {/* ── Greeting hero ── */}
      <div
        className="relative overflow-hidden"
        style={{
          background:   'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px) 0 0 / 22px 22px, linear-gradient(135deg, rgba(37,99,235,0.12) 0%, rgba(59,130,246,0.08) 50%, rgba(96,165,250,0.05) 100%)',
          border:       '1px solid rgba(37,99,235,0.2)',
          borderRadius: '14px',
          padding:      '14px 20px',
          boxShadow:    '0 0 40px rgba(37,99,235,0.10)',
        }}
      >
        <div
          className="absolute pointer-events-none z-0"
          style={{
            top: '-60px', right: '-20px', width: '280px', height: '280px', borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(37,99,235,0.28) 0%, rgba(59,130,246,0.10) 50%, transparent 70%)',
          }}
        />
        {/* Sparkle star decorations */}
        {[
          { top: '12px',  right: '160px', size: '14px', opacity: 0.7 },
          { top: '32px',  right: '80px',  size: '10px', opacity: 0.5 },
          { bottom: '14px', right: '120px', size: '8px',  opacity: 0.4 },
        ].map((s, i) => (
          <span key={i} className="absolute pointer-events-none z-0 select-none" style={{
            ...s, color: '#fbbf24', fontSize: s.size, lineHeight: 1,
          }}>✦</span>
        ))}
        <div className="relative z-10 space-y-1">
          <h1 style={{
            fontSize: '1.55rem', fontWeight: 900, color: '#f1f5f9',
            letterSpacing: '-0.8px', textShadow: '0 0 40px rgba(37,99,235,0.4)',
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
            {summary.stale_submittals_count > 0 && (
              <StatusPill label={`${summary.stale_submittals_count} stale`} color="orange" to="/submittals?filter=stale" />
            )}
          </div>
        </div>
      </div>

      {/* ── Client filter bar ── */}
      <div className="flex items-center gap-3 bg-[#0d1117] border border-white/[0.06] rounded-xl px-4 py-3">
        <Building2 className="h-4 w-4 text-slate-500 shrink-0" />
        <span className="text-sm text-slate-400 shrink-0">Filter by client</span>
        <select
          value={selectedClient ?? ''}
          onChange={e => setSelectedClient(e.target.value ? Number(e.target.value) : null)}
          disabled={clientsLoading}
          className="h-8 rounded-md border border-white/[0.12] bg-[#09090f] text-slate-200 px-2.5 text-sm flex-1 max-w-xs disabled:opacity-50"
        >
          {clientsLoading
            ? <option value="">Loading clients…</option>
            : <>
                <option value="">All clients</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </>
          }
        </select>
        {selectedClient && (
          <>
            <span className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-full px-2.5 py-0.5 shrink-0">
              {selectedClientName}
            </span>
            <button
              onClick={() => setSelectedClient(null)}
              className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </button>
          </>
        )}
        {!selectedClient && (
          <p className="hidden md:block ml-auto text-xs text-slate-500 italic">
            Pick a client to scope: KPIs, Time to Fill, Decline Reasons, Diversity
          </p>
        )}
      </div>

      {/* ── Hiring KPI tiles ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {HIRING_KPIS.map(k => (
          <HiringKpiTile key={k.label} label={k.label} value={k.value} cfg={k.cfg} loading={kpisLoading} />
        ))}
      </div>

      {/* ── Pipeline Funnel | Time to Fill Trend ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ConversionFunnel stages={funnelData?.stages ?? []} loading={funnelLoading} error={funnelError} />
        <WidgetCard title={`Time to Fill Trend${selectedClientName ? ` · ${selectedClientName}` : ''}`} loading={trendLoading}>
          {trendData ? <TimeToFillTrendWidget data={trendData} /> : <Empty />}
        </WidgetCard>
      </div>

      {/* ── Source Effectiveness | Decline Reasons ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <WidgetCard title="Source Effectiveness" loading={analyticsLoading}>
          {sources.length === 0
            ? <Empty />
            : <div className="space-y-3">{sources.map(s => <SourceBar key={s.source} entry={s} max={maxCandidates} />)}</div>
          }
        </WidgetCard>
        <WidgetCard title={`Decline Reasons${selectedClientName ? ` · ${selectedClientName}` : ''}`} loading={declineLoading}>
          {declineData ? <DeclineReasonsWidget data={declineData} /> : <Empty />}
        </WidgetCard>
      </div>

      {/* ── Diversity Breakdown ── */}
      <WidgetCard title={`Hires by Gender & Client${selectedClientName ? ` · ${selectedClientName}` : ''}`} loading={diversityLoading}>
        {diversityData ? <DiversityWidget data={diversityData} /> : <Empty />}
      </WidgetCard>

      {/* ── My Day: Performance + Schedule + Deadlines + Tasks ── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">

        {!isCEO && <PerformanceSidebar data={scorecard} loading={scLoading} />}

        <div className={isCEO ? 'md:col-span-6' : 'md:col-span-4'}>
          <TodaySchedulePanel interviews={data.interviews_today} />
        </div>

        <div className={isCEO ? 'md:col-span-6' : 'md:col-span-4'}>
          <UpcomingDeadlinesPanel deadlines={data.upcoming_deadlines} />
        </div>

        <div className="md:col-span-12">
          <TaskPanel />
        </div>

      </div>

    </div>
  )
}
