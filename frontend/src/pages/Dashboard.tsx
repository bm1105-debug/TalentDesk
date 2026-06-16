// Dashboard — personalised "My Day" action queue for the logged-in recruiter.

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Briefcase, FileText, AlertTriangle, Clock,
  HandCoins, CheckCircle, ChevronRight,
} from 'lucide-react'
import api from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { Badge } from '@/components/ui/badge'

// ── Types ──────────────────────────────────────────────────────────────────────

interface JobCard {
  id: number
  title: string
  client_name: string
  priority: string
  status: string
  target_date: string | null
}

interface SubmittalCard {
  id: number
  candidate_name: string
  job_title: string
  current_stage_name: string | null
  updated_at: string
}

interface OfferCard {
  id: number
  candidate_name: string
  job_title: string
  client_name: string
  salary: string
  currency: string
  offer_date: string
  expiry_date: string | null
}

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

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysAgo(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function daysOverdue(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function fmtSalary(amount: string, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(Number(amount))
}

function greeting(name: string) {
  const h = new Date().getHours()
  const prefix = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  return `${prefix}, ${name}`
}

function todayLabel() {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

const PRIORITY_VARIANT: Record<string, 'destructive' | 'warning' | 'default' | 'secondary'> = {
  urgent: 'destructive',
  high:   'warning',
  medium: 'default',
  low:    'secondary',
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-36" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-12" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <Skeleton className="h-5 w-28" />
            {Array.from({ length: 3 }).map((_, j) => (
              <Skeleton key={j} className="h-12 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, tone = 'neutral',
}: {
  label: string
  value: number
  icon: React.ElementType
  tone?: 'neutral' | 'alert' | 'warn' | 'green'
}) {
  const colors = {
    neutral: { bg: 'bg-blue-50',   icon: 'text-blue-600',  val: 'text-gray-900' },
    alert:   { bg: 'bg-red-50',    icon: 'text-red-500',   val: 'text-red-600'  },
    warn:    { bg: 'bg-orange-50', icon: 'text-orange-500',val: 'text-orange-600'},
    green:   { bg: 'bg-green-50',  icon: 'text-green-600', val: 'text-green-700'},
  }[tone]

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className={`text-3xl font-bold mt-1.5 ${colors.val}`}>{value}</p>
        </div>
        <div className={`p-2.5 rounded-lg ${colors.bg}`}>
          <Icon className={`h-4 w-4 ${colors.icon}`} />
        </div>
      </div>
    </div>
  )
}

// ── Panel wrapper ──────────────────────────────────────────────────────────────

function Panel({
  title, icon: Icon, iconClass, count, children,
}: {
  title: string
  icon: React.ElementType
  iconClass: string
  count: number
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className={`flex items-center gap-2 text-sm font-semibold ${iconClass}`}>
          <Icon className="h-4 w-4" />
          {title}
        </div>
        {count > 0 && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${iconClass} bg-opacity-10`}
            style={{ background: 'currentColor' }}>
            <span className="relative text-white mix-blend-normal">{count}</span>
          </span>
        )}
      </div>
      <div className="divide-y divide-gray-50 flex-1">
        {children}
      </div>
    </div>
  )
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="px-4 py-6 text-center text-sm text-gray-400">{message}</div>
  )
}

// ── Row components ─────────────────────────────────────────────────────────────

function UrgentJobRow({ job }: { job: JobCard }) {
  return (
    <Link to="/jobs"
      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors group">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{job.title}</p>
        <p className="text-xs text-gray-400 truncate">{job.client_name}</p>
      </div>
      <div className="flex items-center gap-2 ml-3 flex-shrink-0">
        <Badge variant={PRIORITY_VARIANT[job.priority] ?? 'secondary'}>{job.priority}</Badge>
        <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
      </div>
    </Link>
  )
}

function OverdueJobRow({ job }: { job: JobCard }) {
  const days = job.target_date ? daysOverdue(job.target_date) : 0
  return (
    <Link to="/jobs"
      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors group">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{job.title}</p>
        <p className="text-xs text-gray-400 truncate">{job.client_name}</p>
      </div>
      <div className="flex items-center gap-2 ml-3 flex-shrink-0">
        <span className="text-xs font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
          {days}d overdue
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
      </div>
    </Link>
  )
}

function StaleSubmittalRow({ s }: { s: SubmittalCard }) {
  return (
    <Link to="/submittals"
      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors group">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{s.candidate_name}</p>
        <p className="text-xs text-gray-400 truncate">{s.job_title}</p>
      </div>
      <div className="flex items-center gap-2 ml-3 flex-shrink-0">
        <div className="text-right">
          <p className="text-xs text-gray-500">{s.current_stage_name ?? '—'}</p>
          <p className="text-xs text-yellow-600">{daysAgo(s.updated_at)}d idle</p>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
      </div>
    </Link>
  )
}

function PendingOfferRow({ o }: { o: OfferCard }) {
  const isExpiringSoon = o.expiry_date
    ? daysOverdue(o.expiry_date) >= -3  // within 3 days or past
    : false
  const isExpired = o.expiry_date ? daysOverdue(o.expiry_date) > 0 : false

  return (
    <Link to="/offers"
      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors group">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{o.candidate_name}</p>
        <p className="text-xs text-gray-400 truncate">{o.job_title} · {o.client_name}</p>
      </div>
      <div className="flex items-center gap-2 ml-3 flex-shrink-0">
        <div className="text-right">
          <p className="text-xs font-medium text-gray-700">{fmtSalary(o.salary, o.currency)}</p>
          {o.expiry_date && (
            <p className={`text-xs ${isExpired ? 'text-red-600 font-medium' : isExpiringSoon ? 'text-orange-500' : 'text-gray-400'}`}>
              {isExpired ? 'Expired' : `Exp ${fmtDate(o.expiry_date)}`}
            </p>
          )}
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500 transition-colors" />
      </div>
    </Link>
  )
}

// ── All-clear banner ───────────────────────────────────────────────────────────

function AllClear() {
  return (
    <div className="col-span-4 flex flex-col items-center justify-center py-16 text-center">
      <div className="p-4 bg-green-50 rounded-full mb-4">
        <CheckCircle className="h-8 w-8 text-green-500" />
      </div>
      <p className="text-base font-medium text-gray-800">All clear</p>
      <p className="text-sm text-gray-400 mt-1">No urgent jobs, overdue roles, stale submittals, or pending offers.</p>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth()

  const { data, isLoading, isError } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn:  () => api.get('/dashboard/my-day/').then(r => r.data),
    refetchInterval: 60_000, // refresh every minute
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
  const allClear = (
    urgent_jobs.length === 0 &&
    overdue_jobs.length === 0 &&
    stale_submittals.length === 0 &&
    pending_offers.length === 0
  )

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          {greeting(user?.first_name ?? 'there')}
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">{todayLabel()}</p>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="Open Jobs"
          value={summary.open_jobs_count}
          icon={Briefcase}
          tone="neutral"
        />
        <StatCard
          label="Active Submittals"
          value={summary.active_submittals_count}
          icon={FileText}
          tone="neutral"
        />
        <StatCard
          label="Urgent Jobs"
          value={summary.urgent_jobs_count}
          icon={AlertTriangle}
          tone={summary.urgent_jobs_count > 0 ? 'alert' : 'neutral'}
        />
        <StatCard
          label="Overdue Jobs"
          value={summary.overdue_jobs_count}
          icon={Clock}
          tone={summary.overdue_jobs_count > 0 ? 'warn' : 'neutral'}
        />
        <StatCard
          label="Pending Offers"
          value={summary.pending_offers_count}
          icon={HandCoins}
          tone={summary.pending_offers_count > 0 ? 'green' : 'neutral'}
        />
      </div>

      {/* ── Action panels ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">

        {allClear ? <AllClear /> : (
          <>
            {/* Urgent jobs */}
            <Panel
              title="Urgent Jobs"
              icon={AlertTriangle}
              iconClass="text-red-600"
              count={urgent_jobs.length}
            >
              {urgent_jobs.length === 0
                ? <EmptyRow message="No urgent jobs" />
                : urgent_jobs.map(j => <UrgentJobRow key={j.id} job={j} />)
              }
            </Panel>

            {/* Overdue jobs */}
            <Panel
              title="Overdue Jobs"
              icon={Clock}
              iconClass="text-orange-600"
              count={overdue_jobs.length}
            >
              {overdue_jobs.length === 0
                ? <EmptyRow message="No overdue jobs" />
                : overdue_jobs.map(j => <OverdueJobRow key={j.id} job={j} />)
              }
            </Panel>

            {/* Stale submittals */}
            <Panel
              title="Stale Submittals"
              icon={FileText}
              iconClass="text-yellow-600"
              count={stale_submittals.length}
            >
              {stale_submittals.length === 0
                ? <EmptyRow message="All submittals moving" />
                : stale_submittals.map(s => <StaleSubmittalRow key={s.id} s={s} />)
              }
            </Panel>

            {/* Pending offers */}
            <Panel
              title="Pending Offers"
              icon={HandCoins}
              iconClass="text-emerald-600"
              count={pending_offers.length}
            >
              {pending_offers.length === 0
                ? <EmptyRow message="No offers awaiting response" />
                : pending_offers.map(o => <PendingOfferRow key={o.id} o={o} />)
              }
            </Panel>
          </>
        )}

      </div>
    </div>
  )
}
