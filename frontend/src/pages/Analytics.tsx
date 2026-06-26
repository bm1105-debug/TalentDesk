import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { Building2, X } from 'lucide-react'
import type {
  CandidatePool, SourceEntry, FunnelStage, InterviewOutcomes,
  OpenJobs, TimeToFill, TimeToFillTrend, DeclineReasons, Diversity,
} from '@/components/analytics/Widgets'
import {
  WidgetCard, StatCard, SourceBar, OpenJobsWidget,
  PipelineFunnelWidget, InterviewOutcomesWidget, TimeToFillWidget,
  TimeToFillTrendWidget, DeclineReasonsWidget, DiversityWidget, Empty, SOURCE_LABELS,
} from '@/components/analytics/Widgets'

// ── Types local to this page ───────────────────────────────────────────────────

interface Client {
  id:   number
  name: string
}

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
    <div className="overflow-x-auto">
    <table className="w-full text-sm min-w-[500px]">
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
            <tr key={row.id} className={isMe ? 'bg-blue-500/10' : ''}>
              <td className="py-2.5 pr-4 font-medium text-slate-100">
                {row.name}
                {isMe && <span className="ml-2 text-xs text-blue-400 font-normal">you</span>}
              </td>
              <td className="py-2.5 text-right text-slate-400">{row.active}</td>
              <td className="py-2.5 text-right text-slate-400">{row.placements}</td>
              <td className="py-2.5 pl-4">
                <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Analytics() {
  const { user } = useAuth()
  const [selectedClient, setSelectedClient] = useState<number | null>(null)

  // ── Clients list for filter dropdown ──────────────────────────────────────────
  const { data: clients = [], isLoading: clientsLoading } = useQuery<Client[]>({
    queryKey: ['clients-simple'],
    queryFn: () =>
      api.get('/clients/', { params: { page_size: 200 } }).then(r =>
        Array.isArray(r.data) ? r.data : r.data.results
      ),
  })

  // ── Firm-wide analytics (not client-scoped) ───────────────────────────────────
  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ['analytics'],
    queryFn: () => api.get('/dashboard/analytics/').then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  // ── Client-filtered queries ───────────────────────────────────────────────────
  const clientParam = selectedClient ? { client: selectedClient } : {}

  const { data: trendData, isLoading: trendLoading } = useQuery<TimeToFillTrend>({
    queryKey: ['time-to-fill-trend', selectedClient],
    queryFn: () => api.get('/dashboard/time-to-fill-trend/', { params: clientParam }).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const { data: declineData, isLoading: declineLoading } = useQuery<DeclineReasons>({
    queryKey: ['decline-reasons', selectedClient],
    queryFn: () => api.get('/dashboard/decline-reasons/', { params: clientParam }).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const { data: diversityData, isLoading: diversityLoading } = useQuery<Diversity>({
    queryKey: ['diversity', selectedClient],
    queryFn: () => api.get('/dashboard/diversity/', { params: clientParam }).then(r => r.data),
    staleTime: 5 * 60 * 1000,
  })

  const pool    = data?.candidate_pool
  const sources = data?.source_effectiveness ?? []
  const maxCandidates = sources.length > 0 ? Math.max(...sources.map(s => s.candidates)) : 1

  const selectedClientName = clients.find(c => c.id === selectedClient)?.name

  return (
    <div className="space-y-4">

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
            Pick a client to scope: Time to Fill, Decline Reasons, Diversity
          </p>
        )}
      </div>

      {/* ── Row 1: Candidate pool stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Active"      value={pool?.active}      loading={isLoading} />
        <StatCard label="Passive"     value={pool?.passive}     loading={isLoading} />
        <StatCard label="Placed"      value={pool?.placed}      loading={isLoading} />
        <StatCard label="Blacklisted" value={pool?.blacklisted} loading={isLoading} />
      </div>

      {/* ── Row 2: Time to Fill Trend (full width) ── */}
      <WidgetCard title={`Time to Fill Trend${selectedClientName ? ` · ${selectedClientName}` : ''}`} loading={trendLoading}>
        {trendData ? <TimeToFillTrendWidget data={trendData} /> : <Empty />}
      </WidgetCard>

      {/* ── Row 3: Source effectiveness | Decline reasons ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <WidgetCard title="Source Effectiveness" loading={isLoading}>
          {sources.length === 0
            ? <Empty />
            : <div className="space-y-3">{sources.map(s => <SourceBar key={s.source} entry={s} max={maxCandidates} />)}</div>
          }
        </WidgetCard>
        <WidgetCard title={`Decline Reasons${selectedClientName ? ` · ${selectedClientName}` : ''}`} loading={declineLoading}>
          {declineData ? <DeclineReasonsWidget data={declineData} /> : <Empty />}
        </WidgetCard>
      </div>

      {/* ── Row 4: Diversity breakdown (full width) ── */}
      <WidgetCard title={`Hires by Gender & Client${selectedClientName ? ` · ${selectedClientName}` : ''}`} loading={diversityLoading}>
        {diversityData ? <DiversityWidget data={diversityData} /> : <Empty />}
      </WidgetCard>

      {/* ── Row 5: Open jobs breakdown ── */}
      <WidgetCard title="Open Jobs Breakdown" loading={isLoading}>
        {data?.open_jobs ? <OpenJobsWidget data={data.open_jobs} /> : <Empty />}
      </WidgetCard>

      {/* ── Row 6: Pipeline funnel | Interview outcomes ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <WidgetCard title="Pipeline Funnel" loading={isLoading}>
          <PipelineFunnelWidget stages={data?.pipeline_funnel ?? []} />
        </WidgetCard>
        <WidgetCard title="Interview Outcomes" loading={isLoading}>
          {data?.interview_outcomes ? <InterviewOutcomesWidget data={data.interview_outcomes} /> : <Empty />}
        </WidgetCard>
      </div>

      {/* ── Row 7: Recruiter leaderboard ── */}
      <WidgetCard title="Recruiter Leaderboard" loading={isLoading}>
        <LeaderboardWidget rows={data?.recruiter_leaderboard ?? []} currentUserId={user?.id} />
      </WidgetCard>

      {/* ── Row 8: Time to fill by job ── */}
      <WidgetCard title="Time to Fill by Job" loading={isLoading}>
        {data?.time_to_fill ? <TimeToFillWidget data={data.time_to_fill} /> : <Empty />}
      </WidgetCard>
    </div>
  )
}
