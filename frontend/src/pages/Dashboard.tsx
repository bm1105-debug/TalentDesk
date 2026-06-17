// Dashboard — "My Day" with gradient stat cards, performance sidebar, and rich action panels.

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Briefcase, FileText, AlertTriangle, Clock,
  HandCoins, CheckCircle, ChevronRight, TrendingUp, Trophy, Users,
} from 'lucide-react'
import api from '@/api/client'
import { useAuth } from '@/context/AuthContext'

// ── Types ──────────────────────────────────────────────────────────────────────

interface JobCard   { id: number; title: string; client_name: string; priority: string; target_date: string | null }
interface SubmittalCard { id: number; candidate_name: string; job_title: string; current_stage_name: string | null; updated_at: string }
interface OfferCard { id: number; candidate_name: string; job_title: string; client_name: string; salary: string; currency: string; offer_date: string; expiry_date: string | null }

interface DashboardData {
  summary: {
    open_jobs_count: number
    active_submittals_count: number
    urgent_jobs_count: number
    overdue_jobs_count: number
    stale_submittals_count: number
    pending_offers_count: number
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
        <div className="h-7 w-52 bg-gray-200 rounded animate-pulse" />
        <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {['bg-blue-400','bg-violet-400','bg-red-400','bg-orange-400','bg-emerald-400'].map(c => (
          <div key={c} className={`${c} rounded-2xl p-5 space-y-4`}>
            <Sk className="h-8 w-8" /><Sk className="h-8 w-12" /><Sk className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-4 bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
          <div className="h-4 w-28 bg-gray-200 rounded animate-pulse" />
          <div className="flex justify-center"><div className="w-24 h-24 rounded-full bg-gray-100 animate-pulse" /></div>
          {[1,2,3].map(i => <div key={i} className="h-3 bg-gray-100 rounded animate-pulse" />)}
        </div>
        <div className="col-span-8 grid grid-cols-2 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="h-10 bg-gray-50 animate-pulse" />
              {[1,2].map(j => <div key={j} className="h-14 border-b border-gray-50 animate-pulse" />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Gradient stat cards ────────────────────────────────────────────────────────

interface GradientCardConfig {
  from: string; to: string; shadow: string; icon: React.ElementType
}

const CARD_STYLES: GradientCardConfig[] = [
  { from: 'from-blue-500',    to: 'to-blue-700',    shadow: '0 12px 28px -6px rgba(59,130,246,0.45)',   icon: Briefcase    },
  { from: 'from-violet-500',  to: 'to-purple-700',  shadow: '0 12px 28px -6px rgba(139,92,246,0.45)',  icon: FileText     },
  { from: 'from-red-500',     to: 'to-rose-700',    shadow: '0 12px 28px -6px rgba(239,68,68,0.40)',   icon: AlertTriangle},
  { from: 'from-orange-500',  to: 'to-orange-700',  shadow: '0 12px 28px -6px rgba(249,115,22,0.40)',  icon: Clock        },
  { from: 'from-emerald-500', to: 'to-teal-700',    shadow: '0 12px 28px -6px rgba(16,185,129,0.40)',  icon: HandCoins    },
]

function GradientCard({ label, value, cfg, accent = false }:
  { label: string; value: number; cfg: GradientCardConfig; accent?: boolean }) {
  const Icon = cfg.icon
  return (
    <div
      className={`bg-gradient-to-br ${cfg.from} ${cfg.to} rounded-2xl p-5 text-white relative overflow-hidden`}
      style={{ boxShadow: accent && value > 0 ? cfg.shadow : '0 4px 12px -2px rgba(0,0,0,0.08)' }}
    >
      {/* Decorative background circles */}
      <div className="absolute -right-5 -top-5 w-28 h-28 rounded-full bg-white/10 pointer-events-none" />
      <div className="absolute -right-2 -bottom-8 w-20 h-20 rounded-full bg-white/10 pointer-events-none" />

      <div className="relative">
        <div className="p-2 bg-white/20 rounded-xl w-fit backdrop-blur-sm mb-4">
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-3xl font-bold tracking-tight">{value}</p>
        <p className="text-sm text-white/75 mt-1 font-medium">{label}</p>
      </div>
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
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <circle cx="44" cy="44" r={R} fill="none" stroke="#f1f5f9" strokeWidth="8" />
        <circle
          cx="44" cy="44" r={R} fill="none" stroke="url(#ringGrad)" strokeWidth="8"
          strokeDasharray={C} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-gray-900">{rate}%</span>
        <span className="text-[10px] text-gray-400 font-medium -mt-0.5">rate</span>
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
    <div className="col-span-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-violet-50 rounded-lg">
          <Trophy className="h-4 w-4 text-violet-600" />
        </div>
        <span className="text-sm font-semibold text-gray-800">My Performance</span>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="w-24 h-24 rounded-full bg-gray-100 animate-pulse mx-auto" />
          {[1,2,3].map(i => <div key={i} className="h-3 bg-gray-100 rounded animate-pulse" />)}
        </div>
      ) : (
        <>
          {/* Conversion ring */}
          <ConversionRing rate={stats?.conversion_rate ?? 0} />

          {/* Mini stats */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Total',  value: stats?.total  ?? 0, color: 'text-gray-700',    bg: 'bg-gray-50'    },
              { label: 'Active', value: stats?.active ?? 0, color: 'text-blue-700',   bg: 'bg-blue-50'   },
              { label: 'Placed', value: stats?.placed ?? 0, color: 'text-emerald-700', bg: 'bg-emerald-50' },
            ].map(s => (
              <div key={s.label} className={`${s.bg} rounded-xl p-2.5 text-center`}>
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Pipeline mini bars */}
          {pipeline.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pipeline</p>
              {pipeline.map(row => (
                <div key={row.stage}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600 truncate max-w-[80%]">{row.stage}</span>
                    <span className="text-gray-400 font-medium">{row.count}</span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
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
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recent Placements</p>
              {places.map((p, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-emerald-700">
                      {p.candidate.charAt(0)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-800 truncate">{p.candidate}</p>
                    <p className="text-[10px] text-gray-400 truncate">{p.job}</p>
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0">{fmtDate(p.placed_at)}</span>
                </div>
              ))}
            </div>
          )}

          {pipeline.length === 0 && places.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">No activity yet</p>
          )}
        </>
      )}
    </div>
  )
}

// ── Action panel ───────────────────────────────────────────────────────────────

interface PanelColor { headerBg: string; headerBorder: string; titleColor: string; iconBg: string; iconColor: string }

const PANEL_COLORS: Record<string, PanelColor> = {
  red:     { headerBg: 'bg-red-50',     headerBorder: 'border-red-100',     titleColor: 'text-red-700',     iconBg: 'bg-red-100',     iconColor: 'text-red-500'     },
  orange:  { headerBg: 'bg-orange-50',  headerBorder: 'border-orange-100',  titleColor: 'text-orange-700',  iconBg: 'bg-orange-100',  iconColor: 'text-orange-500'  },
  amber:   { headerBg: 'bg-amber-50',   headerBorder: 'border-amber-100',   titleColor: 'text-amber-700',   iconBg: 'bg-amber-100',   iconColor: 'text-amber-500'   },
  emerald: { headerBg: 'bg-emerald-50', headerBorder: 'border-emerald-100', titleColor: 'text-emerald-700', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-500' },
}

function ActionPanel({ title, icon: Icon, color, count, children }:
  { title: string; icon: React.ElementType; color: keyof typeof PANEL_COLORS; count: number; children: React.ReactNode }) {
  const c = PANEL_COLORS[color]
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
      <div className={`flex items-center justify-between px-4 py-3 ${c.headerBg} border-b ${c.headerBorder}`}>
        <div className={`flex items-center gap-2 text-sm font-semibold ${c.titleColor}`}>
          <Icon className="h-4 w-4" />
          {title}
        </div>
        {count > 0 && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.iconBg} ${c.titleColor}`}>
            {count}
          </span>
        )}
      </div>
      <div className="flex-1 divide-y divide-gray-50">
        {children}
      </div>
    </div>
  )
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-300">
      <CheckCircle className="h-4 w-4" />
      {message}
    </div>
  )
}

// ── Panel row components ───────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high:   'bg-orange-100 text-orange-700',
  medium: 'bg-blue-100 text-blue-700',
  low:    'bg-gray-100 text-gray-600',
}

function UrgentJobRow({ job }: { job: JobCard }) {
  return (
    <Link to="/jobs" className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/80 transition-colors group">
      <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
        <Briefcase className="h-3.5 w-3.5 text-red-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 truncate">{job.title}</p>
        <p className="text-xs text-gray-400 truncate">{job.client_name}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${PRIORITY_COLORS[job.priority] ?? 'bg-gray-100 text-gray-500'}`}>
          {job.priority}
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
      </div>
    </Link>
  )
}

function OverdueJobRow({ job }: { job: JobCard }) {
  const days = job.target_date ? daysOverdue(job.target_date) : 0
  return (
    <Link to="/jobs" className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/80 transition-colors group">
      <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
        <Clock className="h-3.5 w-3.5 text-orange-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 truncate">{job.title}</p>
        <p className="text-xs text-gray-400 truncate">{job.client_name}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 uppercase tracking-wide">
          {days}d late
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
      </div>
    </Link>
  )
}

function StaleRow({ s }: { s: SubmittalCard }) {
  return (
    <Link to="/submittals" className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/80 transition-colors group">
      <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
        <Users className="h-3.5 w-3.5 text-amber-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 truncate">{s.candidate_name}</p>
        <p className="text-xs text-gray-400 truncate">{s.job_title}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <div className="text-right">
          <p className="text-[10px] text-gray-400">{s.current_stage_name ?? '—'}</p>
          <p className="text-[10px] font-semibold text-amber-600">{daysAgo(s.updated_at)}d idle</p>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
      </div>
    </Link>
  )
}

function OfferRow({ o }: { o: OfferCard }) {
  const isExpired     = o.expiry_date ? daysOverdue(o.expiry_date) > 0  : false
  const isExpiringSoon = o.expiry_date ? daysOverdue(o.expiry_date) >= -3 : false
  return (
    <Link to="/offers" className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/80 transition-colors group">
      <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
        <HandCoins className="h-3.5 w-3.5 text-emerald-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 truncate">{o.candidate_name}</p>
        <p className="text-xs text-gray-400 truncate">{o.job_title}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <div className="text-right">
          <p className="text-[10px] font-semibold text-emerald-700">{fmtSalary(o.salary, o.currency)}</p>
          {o.expiry_date && (
            <p className={`text-[10px] font-medium ${isExpired ? 'text-red-600' : isExpiringSoon ? 'text-orange-500' : 'text-gray-400'}`}>
              {isExpired ? 'Expired' : `Exp ${fmtDate(o.expiry_date)}`}
            </p>
          )}
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
      </div>
    </Link>
  )
}

// ── All-clear ──────────────────────────────────────────────────────────────────

function AllClear() {
  return (
    <div className="col-span-2 flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm text-center">
      <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4"
        style={{ boxShadow: '0 0 0 8px rgba(16,185,129,0.08)' }}>
        <CheckCircle className="h-8 w-8 text-emerald-500" />
      </div>
      <p className="text-base font-semibold text-gray-800">You're all caught up</p>
      <p className="text-sm text-gray-400 mt-1 max-w-xs">
        No urgent jobs, overdue roles, stale submittals, or pending offers.
      </p>
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

  const STAT_CARDS = [
    { label: 'Open Jobs',          value: summary.open_jobs_count,          cfg: CARD_STYLES[0], accent: false },
    { label: 'Active Submittals',  value: summary.active_submittals_count,  cfg: CARD_STYLES[1], accent: false },
    { label: 'Urgent Jobs',        value: summary.urgent_jobs_count,        cfg: CARD_STYLES[2], accent: true  },
    { label: 'Overdue Jobs',       value: summary.overdue_jobs_count,       cfg: CARD_STYLES[3], accent: true  },
    { label: 'Pending Offers',     value: summary.pending_offers_count,     cfg: CARD_STYLES[4], accent: true  },
  ]

  const allClear = urgent_jobs.length === 0 && overdue_jobs.length === 0 &&
                   stale_submittals.length === 0 && pending_offers.length === 0

  return (
    <div className="space-y-5">

      {/* ── Greeting ── */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          {greeting(user?.first_name ?? 'there')}
        </h1>
        <p className="text-sm text-gray-400 mt-0.5 flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5" />
          {todayLabel()}
        </p>
      </div>

      {/* ── Gradient stat cards ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {STAT_CARDS.map(s => (
          <GradientCard key={s.label} label={s.label} value={s.value} cfg={s.cfg} accent={s.accent} />
        ))}
      </div>

      {/* ── Main content ── */}
      <div className="grid grid-cols-12 gap-4">

        {/* Performance sidebar */}
        <PerformanceSidebar data={scorecard} loading={scLoading} />

        {/* Action panels 2×2 */}
        <div className="col-span-8 grid grid-cols-2 gap-4">
          {allClear ? (
            <AllClear />
          ) : (
            <>
              <ActionPanel title="Urgent Jobs"       icon={AlertTriangle} color="red"     count={urgent_jobs.length}>
                {urgent_jobs.length === 0
                  ? <EmptyRow message="No urgent jobs" />
                  : urgent_jobs.map(j => <UrgentJobRow key={j.id} job={j} />)}
              </ActionPanel>

              <ActionPanel title="Overdue Jobs"      icon={Clock}         color="orange"  count={overdue_jobs.length}>
                {overdue_jobs.length === 0
                  ? <EmptyRow message="No overdue jobs" />
                  : overdue_jobs.map(j => <OverdueJobRow key={j.id} job={j} />)}
              </ActionPanel>

              <ActionPanel title="Stale Submittals"  icon={FileText}      color="amber"   count={stale_submittals.length}>
                {stale_submittals.length === 0
                  ? <EmptyRow message="All submittals moving" />
                  : stale_submittals.map(s => <StaleRow key={s.id} s={s} />)}
              </ActionPanel>

              <ActionPanel title="Pending Offers"    icon={HandCoins}     color="emerald" count={pending_offers.length}>
                {pending_offers.length === 0
                  ? <EmptyRow message="No offers awaiting response" />
                  : pending_offers.map(o => <OfferRow key={o.id} o={o} />)}
              </ActionPanel>
            </>
          )}
        </div>

      </div>
    </div>
  )
}
