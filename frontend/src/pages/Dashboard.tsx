// Dashboard — "My Day" with gradient stat cards, performance sidebar, and rich action panels.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import {
  Briefcase, FileText, AlertTriangle, Clock,
  HandCoins, CheckCircle, ChevronRight, TrendingUp, TrendingDown,
  CalendarDays, Trophy, Users,
  ListTodo, Plus, ChevronDown, ChevronUp,
} from 'lucide-react'
import api from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/StatusBadge'

// ── Types ──────────────────────────────────────────────────────────────────────

interface JobCard   { id: number; title: string; client_name: string; priority: string; target_date: string | null }
interface SubmittalCard { id: number; candidate_name: string; job_title: string; current_stage_name: string | null; updated_at: string }
interface OfferCard { id: number; candidate_name: string; job_title: string; client_name: string; salary: string; currency: string; offer_date: string; expiry_date: string | null }

interface Trend { direction: 'up' | 'down' | 'flat'; pct: number }

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
  urgent_jobs: JobCard[]
  overdue_jobs: JobCard[]
  stale_submittals: SubmittalCard[]
  pending_offers: OfferCard[]
}

interface ScorecardData {
  stats: { total: number; active: number; placed: number; conversion_rate: number }
  pipeline: { stage: string; count: number }[]
  recent_placements: { candidate: string; job: string; placed_at: string }[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysAgo(iso: string)     { return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) }
function daysOverdue(iso: string) { return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
function fmtSalary(amount: string, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(amount))
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
        <div className="col-span-8 grid grid-cols-2 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="panel-card overflow-hidden">
              <div className="h-10 bg-white/5 animate-pulse" />
              {[1,2].map(j => <div key={j} className="h-14 border-b border-white/[0.04] animate-pulse" />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Status pills ───────────────────────────────────────────────────────────────

function StatusPill({ label, color }: { label: string; color: 'red' | 'purple' | 'cyan' }) {
  void color  // retained for call-site compatibility; pills are now uniformly glassmorphic
  return <span className="status-pill">{label}</span>
}

// ── Gradient stat cards ────────────────────────────────────────────────────────

interface GradientCardConfig {
  gradient: string; icon: React.ElementType
}

const CARD_STYLES: GradientCardConfig[] = [
  { gradient: 'linear-gradient(135deg, rgba(99,102,241,0.55), rgba(118,75,162,0.45))',    icon: Briefcase     },  // Open Jobs
  { gradient: 'linear-gradient(135deg, rgba(192,80,210,0.50), rgba(180,60,90,0.40))',    icon: FileText      },  // Active Submittals
  { gradient: 'linear-gradient(135deg, rgba(56,130,200,0.55), rgba(0,180,200,0.40))',    icon: AlertTriangle },  // Urgent Jobs
  { gradient: 'linear-gradient(135deg, rgba(34,180,100,0.50), rgba(30,190,160,0.40))',   icon: Clock         },  // Overdue Jobs
  { gradient: 'linear-gradient(135deg, rgba(200,80,120,0.50), rgba(200,160,30,0.40))',   icon: HandCoins     },  // Pending Offers
]

function TrendBadge({ trend }: { trend: Trend }) {
  if (trend.direction === 'flat') {
    return (
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/15 text-white/70">
        —
      </span>
    )
  }
  const isUp = trend.direction === 'up'
  const Icon = isUp ? TrendingUp : TrendingDown
  return (
    <span className="flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/20 text-white">
      <Icon className="h-3 w-3" />
      {trend.pct}%
    </span>
  )
}

function GradientCard({ label, value, cfg, accent = false, to, trend }:
  { label: string; value: number; cfg: GradientCardConfig; accent?: boolean; to?: string; trend?: Trend }) {
  const Icon = cfg.icon
  void accent  // retained in signature for call-site compatibility
  const inner = (
    <div
      className={`rounded-3xl p-4 text-white relative overflow-hidden h-full ${to ? 'glass-card cursor-pointer' : ''}`}
      style={{
        background:     cfg.gradient,
        backdropFilter: 'blur(20px)',
        border:         '1px solid rgba(255,255,255,0.2)',
        boxShadow:      'inset 0 1px 0 rgba(255,255,255,0.25), 0 20px 40px rgba(0,0,0,0.3)',
      }}
    >
      <div className="relative">
        <div className="p-1.5 bg-white/10 border border-white/20 rounded-lg w-fit mb-2">
          <Icon className="h-4 w-4" />
        </div>
        <p className="font-black leading-none text-white stat-num" style={{ fontSize: '2rem', letterSpacing: '-1px' }}>
          {value}
        </p>
        <div className="flex items-center justify-between mt-2">
          <p className="text-sm text-white/75 font-medium">{label}</p>
          {trend && <TrendBadge trend={trend} />}
        </div>
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

// ── Action panel ───────────────────────────────────────────────────────────────

interface PanelColor { iconBg: string; iconColor: string }

const PANEL_COLORS: Record<string, PanelColor> = {
  red:     { iconBg: 'bg-red-500/10',     iconColor: 'text-red-400'     },
  orange:  { iconBg: 'bg-orange-500/10',  iconColor: 'text-orange-400'  },
  amber:   { iconBg: 'bg-amber-500/10',   iconColor: 'text-amber-400'   },
  emerald: { iconBg: 'bg-emerald-500/10', iconColor: 'text-emerald-400' },
}

function ActionPanel({ title, icon: Icon, color, count, children }:
  { title: string; icon: React.ElementType; color: keyof typeof PANEL_COLORS; count: number; children: React.ReactNode }) {
  const c = PANEL_COLORS[color]
  return (
    <div className="panel-card overflow-hidden flex flex-col">
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${c.iconBg}`}>
            <Icon className={`h-3.5 w-3.5 ${c.iconColor}`} />
          </div>
          <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: '13px' }}>{title}</span>
        </div>
        {count > 0 && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.iconBg} ${c.iconColor}`}>
            {count}
          </span>
        )}
      </div>
      <div className="flex-1 divide-y divide-white/[0.04] px-1.5 py-1">
        {children}
      </div>
    </div>
  )
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6 text-xs italic" style={{ color: 'rgba(255,255,255,0.3)' }}>
      <CheckCircle className="h-4 w-4" />
      {message}
    </div>
  )
}

// ── Panel row components ───────────────────────────────────────────────────────

function UrgentJobRow({ job }: { job: JobCard }) {
  return (
    <Link to={`/jobs/${job.id}`} className="flex items-center gap-3 px-2.5 py-2.5 rounded-lg hover:bg-indigo-500/10 transition-colors group">
      <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
        <Briefcase className="h-3.5 w-3.5 text-red-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-100 truncate">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
          {job.title}
        </p>
        <p className="text-xs text-slate-500 truncate">{job.client_name}</p>
      </div>
      <div className="flex items-center flex-shrink-0">
        <ChevronRight className="h-3.5 w-3.5 text-white/20 group-hover:text-white/50 transition-colors" />
      </div>
    </Link>
  )
}

function OverdueJobRow({ job }: { job: JobCard }) {
  const days = job.target_date ? daysOverdue(job.target_date) : 0
  return (
    <Link to={`/jobs/${job.id}`} className="flex items-center gap-3 px-2.5 py-2.5 rounded-lg hover:bg-indigo-500/10 transition-colors group">
      <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
        <Clock className="h-3.5 w-3.5 text-orange-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-100 truncate">{job.title}</p>
        <p className="text-xs text-slate-500 truncate">{job.client_name}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <StatusBadge status="overdue" />
        <ChevronRight className="h-3.5 w-3.5 text-white/20 group-hover:text-white/50 transition-colors" />
      </div>
    </Link>
  )
}

function StaleRow({ s }: { s: SubmittalCard }) {
  return (
    <Link to="/submittals" className="flex items-center gap-3 px-2.5 py-2.5 rounded-lg hover:bg-indigo-500/10 transition-colors group">
      <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
        <Users className="h-3.5 w-3.5 text-amber-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-100 truncate">{s.candidate_name}</p>
        <p className="text-xs text-slate-500 truncate">{s.job_title}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <div className="text-right">
          <p className="text-[10px] text-slate-500">{s.current_stage_name ?? '—'}</p>
          <p className="text-[10px] font-semibold text-amber-400">{daysAgo(s.updated_at)}d idle</p>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-white/20 group-hover:text-white/50 transition-colors" />
      </div>
    </Link>
  )
}

function OfferRow({ o }: { o: OfferCard }) {
  const isExpired     = o.expiry_date ? daysOverdue(o.expiry_date) > 0  : false
  const isExpiringSoon = o.expiry_date ? daysOverdue(o.expiry_date) >= -3 : false
  return (
    <Link to="/offers" className="flex items-center gap-3 px-2.5 py-2.5 rounded-lg hover:bg-indigo-500/10 transition-colors group">
      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
        <HandCoins className="h-3.5 w-3.5 text-emerald-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-100 truncate">{o.candidate_name}</p>
        <p className="text-xs text-slate-500 truncate">{o.job_title}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <div className="text-right">
          <p className="text-[10px] font-semibold text-emerald-400">{fmtSalary(o.salary, o.currency)}</p>
          {o.expiry_date && (
            <p className={`text-[10px] font-medium ${isExpired ? 'text-red-400' : isExpiringSoon ? 'text-orange-400' : 'text-white/30'}`}>
              {isExpired ? 'Expired' : `Exp ${fmtDate(o.expiry_date)}`}
            </p>
          )}
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-white/20 group-hover:text-white/50 transition-colors" />
      </div>
    </Link>
  )
}

// ── All-clear ──────────────────────────────────────────────────────────────────

function AllClear() {
  return (
    <div className="panel-card col-span-2 flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4"
        style={{ boxShadow: '0 0 0 8px rgba(16,185,129,0.06)' }}>
        <CheckCircle className="h-8 w-8 text-emerald-400" />
      </div>
      <p className="text-base font-semibold" style={{ color: '#e2e8f0' }}>You're all caught up</p>
      <p className="text-sm mt-1 max-w-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
        No urgent jobs, overdue roles, stale submittals, or pending offers.
      </p>
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
            <div className="px-4 py-6 text-center text-slate-500 space-y-1.5">
              <ListTodo className="h-5 w-5 mx-auto opacity-40" />
              <p className="text-sm">No open tasks — you're all caught up!</p>
            </div>
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

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth()

  const { data, isLoading, isError } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn:  () => api.get('/dashboard/my-day/').then(r => r.data),
    refetchInterval: 60_000,
  })

  const { data: scorecard, isLoading: scLoading } = useQuery<ScorecardData>({
    queryKey: ['scorecard'],
    queryFn:  () => api.get('/dashboard/scorecard/').then(r => r.data),
  })

  if (isLoading) return <DashboardSkeleton />

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-red-500">Failed to load dashboard. Please refresh.</p>
      </div>
    )
  }

  const { summary, urgent_jobs, overdue_jobs, stale_submittals, pending_offers } = data

  const t = summary.trends
  const STAT_CARDS = [
    { label: 'Open Jobs',         value: summary.open_jobs_count,         cfg: CARD_STYLES[0], accent: false, to: '/jobs',                          trend: t?.open_jobs },
    { label: 'Active Submittals', value: summary.active_submittals_count, cfg: CARD_STYLES[1], accent: false, to: '/submittals',                    trend: t?.active_submittals },
    { label: 'Urgent Jobs',       value: summary.urgent_jobs_count,       cfg: CARD_STYLES[2], accent: true,  to: '/jobs?priority=urgent',          trend: t?.urgent_jobs },
    { label: 'Overdue Jobs',      value: summary.overdue_jobs_count,      cfg: CARD_STYLES[3], accent: true,  to: '/jobs?overdue=true',             trend: t?.overdue_jobs },
    { label: 'Pending Offers',    value: summary.pending_offers_count,    cfg: CARD_STYLES[4], accent: true,  to: '/offers',                        trend: t?.pending_offers },
  ]

  const allClear = urgent_jobs.length === 0 && overdue_jobs.length === 0 &&
                   stale_submittals.length === 0 && pending_offers.length === 0

  return (
    <div className="space-y-5">

      {/* ── Greeting hero card ── */}
      <div
        className="relative overflow-hidden"
        style={{
          background:   'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 50%, rgba(6,182,212,0.06) 100%)',
          border:       '1px solid rgba(99,102,241,0.2)',
          borderRadius: '20px',
          padding:      '24px 28px',
          boxShadow:    '0 0 40px rgba(99,102,241,0.08)',
        }}
      >
        {/* Decorative gradient blob — sits behind content */}
        <div
          className="absolute pointer-events-none z-0"
          style={{
            top:          '-50px',
            right:        0,
            width:        '300px',
            height:       '300px',
            borderRadius: '50%',
            background:   'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
          }}
        />

        {/* Content layer */}
        <div className="relative z-10 space-y-2">
          <h1 style={{
            fontSize:      '1.375rem',
            fontWeight:    700,
            color:         '#f1f5f9',
            letterSpacing: '-0.8px',
            textShadow:    '0 0 30px rgba(99,102,241,0.3)',
          }}>
            {greeting(user?.first_name ?? 'there')}
          </h1>
          <p className="flex items-center gap-1.5" style={{ color: 'rgba(241,245,249,0.45)', fontSize: '13px', fontWeight: 400 }}>
            <CalendarDays className="h-3.5 w-3.5" />
            {todayLabel()}
          </p>
          <div className="flex items-center gap-2 flex-wrap pt-0.5">
            {summary.urgent_jobs_count > 0
              ? <StatusPill label={`${summary.urgent_jobs_count} urgent job${summary.urgent_jobs_count > 1 ? 's' : ''} need attention`} color="red" />
              : <StatusPill label="No urgent jobs" color="red" />}
            <StatusPill label={`${summary.active_submittals_count} active submittal${summary.active_submittals_count !== 1 ? 's' : ''}`} color="purple" />
            {summary.interviews_today_count > 0
              ? <StatusPill label={`${summary.interviews_today_count} interview${summary.interviews_today_count > 1 ? 's' : ''} today`} color="cyan" />
              : <StatusPill label="No interviews today" color="cyan" />}
          </div>
        </div>
      </div>

      {/* ── Gradient stat cards ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {STAT_CARDS.map(s => (
          <GradientCard key={s.label} label={s.label} value={s.value} cfg={s.cfg} accent={s.accent} to={s.to} trend={s.trend} />
        ))}
      </div>

      {/* ── Section divider ── */}
      <div style={{
        width:      '100%',
        height:     '1px',
        margin:     '4px 0',
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)',
      }} />

      {/* ── Main content: performance left, panels + tasks right ── */}
      <div className="grid grid-cols-12 gap-4">

        {/* Performance sidebar */}
        <PerformanceSidebar data={scorecard} loading={scLoading} />

        {/* Right column: action panels + tasks */}
        <div className="col-span-8 flex flex-col gap-4">
          {/* Action panels 2×2 */}
          <div className="grid grid-cols-2 gap-4">
            {allClear ? (
              <AllClear />
            ) : (
              <>
                <ActionPanel title="Urgent Jobs"      icon={AlertTriangle} color="red"     count={urgent_jobs.length}>
                  {urgent_jobs.length === 0
                    ? <EmptyRow message="No urgent jobs" />
                    : urgent_jobs.map(j => <UrgentJobRow key={j.id} job={j} />)}
                </ActionPanel>

                <ActionPanel title="Overdue Jobs"     icon={Clock}         color="orange"  count={overdue_jobs.length}>
                  {overdue_jobs.length === 0
                    ? <EmptyRow message="No overdue jobs" />
                    : overdue_jobs.map(j => <OverdueJobRow key={j.id} job={j} />)}
                </ActionPanel>

                <ActionPanel title="Stale Submittals" icon={FileText}      color="amber"   count={stale_submittals.length}>
                  {stale_submittals.length === 0
                    ? <EmptyRow message="All submittals moving" />
                    : stale_submittals.map(s => <StaleRow key={s.id} s={s} />)}
                </ActionPanel>

                <ActionPanel title="Pending Offers"   icon={HandCoins}     color="emerald" count={pending_offers.length}>
                  {pending_offers.length === 0
                    ? <EmptyRow message="No offers awaiting response" />
                    : pending_offers.map(o => <OfferRow key={o.id} o={o} />)}
                </ActionPanel>
              </>
            )}
          </div>

          {/* Tasks sit below action panels in the same right column */}
          <TaskPanel />
        </div>

      </div>

    </div>
  )
}
