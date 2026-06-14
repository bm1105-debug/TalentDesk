// What this file does: the "My Day" view — a personalised action queue.
// Fetches /api/dashboard/my-day/ and renders summary stat cards, urgent jobs,
// overdue jobs, and stale submittals so the recruiter knows what needs attention.

import { useQuery } from '@tanstack/react-query'
import { Briefcase, FileText, AlertTriangle, Clock } from 'lucide-react'
import api from '@/api/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

interface DashboardData {
  summary: {
    open_jobs_count: number
    active_submittals_count: number
    urgent_jobs_count: number
    overdue_jobs_count: number
    stale_submittals_count: number
  }
  urgent_jobs: JobCard[]
  overdue_jobs: JobCard[]
  stale_submittals: SubmittalCard[]
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function priorityVariant(p: string): 'destructive' | 'warning' | 'default' | 'secondary' {
  if (p === 'urgent') return 'destructive'
  if (p === 'high')   return 'warning'
  if (p === 'normal') return 'default'
  return 'secondary'
}

function daysAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  return Math.floor(diff / 86_400_000)
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, accent = false }:
  { label: string; value: number; icon: React.ElementType; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">{label}</p>
            <p className={`text-3xl font-bold mt-1 ${accent ? 'text-red-600' : 'text-gray-900'}`}>
              {value}
            </p>
          </div>
          <div className={`p-3 rounded-full ${accent ? 'bg-red-50' : 'bg-blue-50'}`}>
            <Icon className={`h-5 w-5 ${accent ? 'text-red-500' : 'text-blue-600'}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function JobRow({ job }: { job: JobCard }) {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-900">{job.title}</p>
        <p className="text-xs text-gray-500">{job.client_name}</p>
      </div>
      <div className="flex items-center gap-2">
        {job.target_date && (
          <span className="text-xs text-gray-400">
            Due {new Date(job.target_date).toLocaleDateString()}
          </span>
        )}
        <Badge variant={priorityVariant(job.priority)}>
          {job.priority}
        </Badge>
      </div>
    </div>
  )
}

function SubmittalRow({ s }: { s: SubmittalCard }) {
  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-900">{s.candidate_name}</p>
        <p className="text-xs text-gray-500">{s.job_title}</p>
      </div>
      <div className="text-right">
        <p className="text-xs text-gray-500">{s.current_stage_name ?? '—'}</p>
        <p className="text-xs text-orange-500">{daysAgo(s.updated_at)}d no movement</p>
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-gray-400 py-4 text-center">{message}</p>
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data, isLoading, isError } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn:  () => api.get('/dashboard/my-day/').then(r => r.data),
  })

  if (isLoading) {
    return <p className="text-sm text-gray-400">Loading…</p>
  }

  if (isError || !data) {
    return <p className="text-sm text-red-500">Failed to load dashboard.</p>
  }

  const { summary, urgent_jobs, overdue_jobs, stale_submittals } = data

  return (
    <div className="space-y-6">

      <h1 className="text-xl font-semibold text-gray-900">My Day</h1>

      {/* ── Summary stat cards ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Open Jobs"          value={summary.open_jobs_count}         icon={Briefcase} />
        <StatCard label="Active Submittals"  value={summary.active_submittals_count} icon={FileText} />
        <StatCard label="Urgent Jobs"        value={summary.urgent_jobs_count}       icon={AlertTriangle} accent={summary.urgent_jobs_count > 0} />
        <StatCard label="Stale Submittals"   value={summary.stale_submittals_count}  icon={Clock}         accent={summary.stale_submittals_count > 0} />
      </div>

      {/* ── Action sections ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Urgent jobs */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-red-600 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" /> Urgent Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {urgent_jobs.length === 0
              ? <EmptyState message="No urgent jobs" />
              : urgent_jobs.map(j => <JobRow key={j.id} job={j} />)
            }
          </CardContent>
        </Card>

        {/* Overdue jobs */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-orange-600 flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> Overdue Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {overdue_jobs.length === 0
              ? <EmptyState message="No overdue jobs" />
              : overdue_jobs.map(j => <JobRow key={j.id} job={j} />)
            }
          </CardContent>
        </Card>

        {/* Stale submittals */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-yellow-600 flex items-center gap-1.5">
              <FileText className="h-4 w-4" /> Stale Submittals
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stale_submittals.length === 0
              ? <EmptyState message="All submittals are moving" />
              : stale_submittals.map(s => <SubmittalRow key={s.id} s={s} />)
            }
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
