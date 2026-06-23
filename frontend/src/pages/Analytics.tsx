import { useQuery } from '@tanstack/react-query'
import api from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import type {
  CandidatePool, SourceEntry, FunnelStage, InterviewOutcomes,
  OpenJobs, TimeToFill,
} from '@/components/analytics/Widgets'
import {
  WidgetCard, StatCard, SourceBar, OpenJobsWidget,
  PipelineFunnelWidget, InterviewOutcomesWidget, TimeToFillWidget,
  Empty, SOURCE_LABELS,
} from '@/components/analytics/Widgets'

// ── Types local to this page ───────────────────────────────────────────────────

interface LeaderboardEntry {
  id: number
  name: string
  active: number
  placements: number
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

// ── Leaderboard (firm-wide only) ───────────────────────────────────────────────

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
            <tr key={row.id} className={isMe ? 'bg-indigo-500/10' : ''}>
              <td className="py-2.5 pr-4 font-medium text-slate-100">
                {row.name}
                {isMe && <span className="ml-2 text-xs text-indigo-400 font-normal">you</span>}
              </td>
              <td className="py-2.5 text-right text-slate-400">{row.active}</td>
              <td className="py-2.5 text-right text-slate-400">{row.placements}</td>
              <td className="py-2.5 pl-4">
                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Analytics() {
  const { user } = useAuth()
  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['analytics'],
    queryFn: () => api.get('/dashboard/analytics/').then(r => r.data),
  })

  const pool    = data?.candidate_pool
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
            : <div className="space-y-3">{sources.map(s => <SourceBar key={s.source} entry={s} max={maxCandidates} />)}</div>
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
          {data?.interview_outcomes ? <InterviewOutcomesWidget data={data.interview_outcomes} /> : <Empty />}
        </WidgetCard>
      </div>

      {/* ── Row 4: Recruiter leaderboard ── */}
      <WidgetCard title="Recruiter Leaderboard" loading={isLoading}>
        <LeaderboardWidget rows={data?.recruiter_leaderboard ?? []} currentUserId={user?.id} />
      </WidgetCard>

      {/* ── Row 5: Time to fill ── */}
      <WidgetCard title="Time to Fill" loading={isLoading}>
        {data?.time_to_fill ? <TimeToFillWidget data={data.time_to_fill} /> : <Empty />}
      </WidgetCard>
    </div>
  )
}
