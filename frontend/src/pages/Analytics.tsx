import { useQuery } from '@tanstack/react-query'
import api from '@/api/client'
import { useAuth } from '@/context/AuthContext'

// ── Types ──────────────────────────────────────────────────────────────────────

interface CandidatePool {
  active: number
  passive: number
  placed: number
  blacklisted: number
}

interface SourceEntry {
  source: string
  candidates: number
  placements: number
}

interface FunnelStage {
  stage: string
  count: number
}

interface InterviewOutcomes {
  completed: number
  cancelled: number
  no_show: number
  avg_score: number | null
}

interface LeaderboardEntry {
  id: number
  name: string
  active: number
  placements: number
}

interface OpenJobs {
  by_status:   { open: number; on_hold: number; draft: number; filled: number }
  by_priority: { urgent: number; high: number; medium: number; low: number }
}

interface TimeToFillJob {
  id: number
  title: string
  client: string
  days: number
}

interface TimeToFill {
  avg_days: number | null
  by_job: TimeToFillJob[]
}

interface AnalyticsData {
  candidate_pool:        CandidatePool | null
  source_effectiveness:  SourceEntry[] | null
  open_jobs:             OpenJobs | null
  recruiter_leaderboard: LeaderboardEntry[] | null
  interview_outcomes:    InterviewOutcomes | null
  pipeline_funnel:       FunnelStage[] | null
  time_to_fill:          TimeToFill | null
}

const SOURCE_LABELS: Record<string, string> = {
  linkedin:  'LinkedIn',
  referral:  'Referral',
  job_board: 'Job Board',
  direct:    'Direct',
  other:     'Other',
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
}

// ── Widget card wrapper ────────────────────────────────────────────────────────

function WidgetCard({ title, children, loading }: {
  title: string
  children: React.ReactNode
  loading: boolean
}) {
  return (
    <div className="bg-[#1a1a2e] rounded-xl border border-white/[0.06] p-5">
      <h2 className="text-sm font-semibold text-slate-300 mb-4">{title}</h2>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : (
        children
      )}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, loading }: { label: string; value?: number | null; loading: boolean }) {
  return (
    <div className="bg-[#1a1a2e] rounded-xl border border-white/[0.06] p-5">
      {loading ? (
        <>
          <Skeleton className="h-8 w-16 mb-2" />
          <Skeleton className="h-3 w-20" />
        </>
      ) : (
        <>
          <p className="text-2xl font-bold text-slate-100">{value ?? '—'}</p>
          <p className="text-sm text-slate-500 mt-0.5">{label}</p>
        </>
      )}
    </div>
  )
}

// ── Source bar ────────────────────────────────────────────────────────────────

function SourceBar({ entry, max }: { entry: SourceEntry; max: number }) {
  const pct = max > 0 ? Math.round((entry.candidates / max) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-slate-300">
          {SOURCE_LABELS[entry.source] ?? entry.source}
        </span>
        <span className="text-slate-500 text-xs">
          {entry.candidates} candidates · {entry.placements} placed
        </span>
      </div>
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── Open jobs widget ──────────────────────────────────────────────────────────

function CountRow({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-slate-400 capitalize">{label.replace('_', ' ')}</span>
      <span className={`text-sm font-semibold ${highlight ? 'text-red-600' : 'text-slate-100'}`}>
        {value}
      </span>
    </div>
  )
}

function OpenJobsWidget({ data }: { data: OpenJobs }) {
  const totalJobs = Object.values(data.by_status).reduce((a, b) => a + b, 0)
  if (totalJobs === 0) return <Empty />
  return (
    <div className="grid grid-cols-2 gap-x-6">
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">By Status</p>
        <div className="divide-y divide-white/[0.04]">
          <CountRow label="Open"    value={data.by_status.open} />
          <CountRow label="On Hold" value={data.by_status.on_hold} />
          <CountRow label="Draft"   value={data.by_status.draft} />
          <CountRow label="Filled"  value={data.by_status.filled} />
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">By Priority</p>
        <div className="divide-y divide-white/[0.04]">
          <CountRow label="Urgent" value={data.by_priority.urgent} highlight={data.by_priority.urgent > 0} />
          <CountRow label="High"   value={data.by_priority.high} />
          <CountRow label="Medium" value={data.by_priority.medium} />
          <CountRow label="Low"    value={data.by_priority.low} />
        </div>
      </div>
    </div>
  )
}

// ── Pipeline funnel ───────────────────────────────────────────────────────────

function PipelineFunnelWidget({ stages }: { stages: FunnelStage[] }) {
  if (stages.length === 0) return <Empty />
  const max = Math.max(...stages.map(s => s.count), 1)
  return (
    <div className="space-y-3">
      {stages.map(s => {
        const pct = Math.round((s.count / max) * 100)
        return (
          <div key={s.stage} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="font-medium text-slate-300">{s.stage}</span>
              <span className="text-slate-500">{s.count}</span>
            </div>
            <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Interview outcomes ────────────────────────────────────────────────────────

function InterviewOutcomesWidget({ data }: { data: InterviewOutcomes }) {
  const total = data.completed + data.cancelled + data.no_show
  if (total === 0) return <Empty />
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Completed', value: data.completed, color: 'text-green-700 bg-green-50 border-green-200' },
          { label: 'Cancelled', value: data.cancelled, color: 'text-amber-700 bg-amber-50 border-amber-200' },
          { label: 'No Show',   value: data.no_show,   color: 'text-red-700 bg-red-50 border-red-200' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-lg border p-3 ${color}`}>
            <p className="text-xl font-bold">{value}</p>
            <p className="text-xs mt-0.5">{label}</p>
          </div>
        ))}
      </div>
      <div className="flex items-baseline gap-2 pt-1 border-t border-white/[0.06]">
        <span className="text-sm text-slate-500">Avg interview score</span>
        <span className="text-lg font-semibold text-slate-100">
          {data.avg_score !== null ? `${data.avg_score} / 100` : 'N/A'}
        </span>
      </div>
    </div>
  )
}

// ── Recruiter leaderboard ─────────────────────────────────────────────────────

function LeaderboardWidget({ rows, currentUserId }: { rows: LeaderboardEntry[]; currentUserId: number | undefined }) {
  if (rows.length === 0) return <Empty />
  const maxPlacements = Math.max(...rows.map(r => r.placements), 1)
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-slate-500 uppercase tracking-wide border-b border-white/[0.06] bg-white/[0.04]">
          <th className="pb-2 font-medium">Recruiter</th>
          <th className="pb-2 font-medium text-right">Active</th>
          <th className="pb-2 font-medium text-right">Placed</th>
          <th className="pb-2 font-medium pl-4 w-40">Bar</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-white/[0.04]">
        {rows.map(row => {
          const isMe = row.id === currentUserId
          const pct  = Math.round((row.placements / maxPlacements) * 100)
          return (
            <tr key={row.id} className={isMe ? 'bg-blue-50' : ''}>
              <td className="py-2.5 pr-4 font-medium text-slate-100">
                {row.name}
                {isMe && <span className="ml-2 text-xs text-blue-500 font-normal">you</span>}
              </td>
              <td className="py-2.5 text-right text-slate-400">{row.active}</td>
              <td className="py-2.5 text-right text-slate-400">{row.placements}</td>
              <td className="py-2.5 pl-4">
                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Time to fill ──────────────────────────────────────────────────────────────

function TimeToFillWidget({ data }: { data: TimeToFill }) {
  if (data.by_job.length === 0) return <Empty />
  const max = Math.max(...data.by_job.map(r => r.days), 1)
  return (
    <div className="space-y-4">
      {data.avg_days !== null && (
        <div className="flex items-baseline gap-2 pb-3 border-b border-white/[0.06]">
          <span className="text-2xl font-bold text-slate-100">{data.avg_days}</span>
          <span className="text-sm text-slate-500">days avg to fill</span>
        </div>
      )}
      <div className="space-y-3">
        {data.by_job.map(row => {
          const pct = Math.round((row.days / max) * 100)
          return (
            <div key={row.id} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="font-medium text-slate-300 truncate max-w-[60%]">{row.title}</span>
                <span className="text-slate-500 text-xs">{row.client} · {row.days}d</span>
              </div>
              <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Empty placeholder ──────────────────────────────────────────────────────────

function Empty() {
  return <p className="text-sm text-slate-500">No data yet</p>
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Analytics() {
  const { user } = useAuth()
  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['analytics'],
    queryFn: () => api.get('/dashboard/analytics/').then(r => r.data),
  })

  const pool = data?.candidate_pool
  const sources = data?.source_effectiveness ?? []
  const maxCandidates = sources.length > 0 ? Math.max(...sources.map(s => s.candidates)) : 1

  return (
    <div className="space-y-4">

      {/* ── Row 1: Candidate pool stat cards ── */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Active"      value={pool?.active}      loading={isLoading} />
        <StatCard label="Passive"     value={pool?.passive}     loading={isLoading} />
        <StatCard label="Placed"      value={pool?.placed}      loading={isLoading} />
        <StatCard label="Blacklisted" value={pool?.blacklisted} loading={isLoading} />
      </div>

      {/* ── Row 2: Source effectiveness | Open jobs ── */}
      <div className="grid grid-cols-2 gap-4">
        <WidgetCard title="Source Effectiveness" loading={isLoading}>
          {sources.length === 0
            ? <Empty />
            : (
              <div className="space-y-3">
                {sources.map(s => (
                  <SourceBar key={s.source} entry={s} max={maxCandidates} />
                ))}
              </div>
            )
          }
        </WidgetCard>

        <WidgetCard title="Open Jobs Breakdown" loading={isLoading}>
          {data?.open_jobs ? <OpenJobsWidget data={data.open_jobs} /> : <Empty />}
        </WidgetCard>
      </div>

      {/* ── Row 3: Pipeline funnel | Interview outcomes ── */}
      <div className="grid grid-cols-2 gap-4">
        <WidgetCard title="Pipeline Funnel" loading={isLoading}>
          <PipelineFunnelWidget stages={data?.pipeline_funnel ?? []} />
        </WidgetCard>

        <WidgetCard title="Interview Outcomes" loading={isLoading}>
          {data?.interview_outcomes
            ? <InterviewOutcomesWidget data={data.interview_outcomes} />
            : <Empty />}
        </WidgetCard>
      </div>

      {/* ── Row 4: Recruiter leaderboard ── */}
      <WidgetCard title="Recruiter Leaderboard" loading={isLoading}>
        <LeaderboardWidget
          rows={data?.recruiter_leaderboard ?? []}
          currentUserId={user?.id}
        />
      </WidgetCard>

      {/* ── Row 5: Time to fill ── */}
      <WidgetCard title="Time to Fill" loading={isLoading}>
        {data?.time_to_fill ? <TimeToFillWidget data={data.time_to_fill} /> : <Empty />}
      </WidgetCard>
    </div>
  )
}
