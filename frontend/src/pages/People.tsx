import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, ChevronDown, Users } from 'lucide-react'
import api from '@/api/client'
import type {
  CandidatePool, SourceEntry, FunnelStage, InterviewOutcomes,
  OpenJobs, TimeToFill,
} from '@/components/analytics/Widgets'
import {
  WidgetCard, StatCard, SourceBar, OpenJobsWidget,
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

function RecruiterStatsWidget({ data, loading }: { data: RecruiterStats | undefined; loading: boolean }) {
  const items = [
    { label: 'Total Submittals', value: data?.total },
    { label: 'Active',           value: data?.active },
    { label: 'Placed',           value: data?.placed },
    { label: 'Conversion Rate',  value: data ? `${data.conversion_rate}%` : undefined },
  ]
  return (
    <div className="grid grid-cols-4 gap-4">
      {items.map(({ label, value }) => (
        <StatCard key={label} label={label} value={value as number | null} loading={loading} />
      ))}
    </div>
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
        className="w-full flex items-center justify-between gap-2 h-10 px-3 rounded-lg border border-white/[0.12] bg-[#1a1a2e] text-sm text-slate-200 hover:border-white/[0.25] transition-colors"
      >
        <span className={selected ? 'text-slate-100' : 'text-slate-500'}>
          {selected ? `${selected.first_name} ${selected.last_name}` : 'Select employee…'}
        </span>
        <ChevronDown className="h-4 w-4 text-slate-500 flex-shrink-0" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-white/[0.12] bg-[#1a1a2e] shadow-xl overflow-hidden">
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
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('user') ? Number(searchParams.get('user')) : null

  const { data: users = [] } = useQuery<UserEntry[]>({
    queryKey: ['users-list'],
    queryFn:  () => api.get('/users/').then(r => r.data),
  })

  const { data, isLoading } = useQuery<UserAnalyticsData>({
    queryKey: ['user-analytics', selectedId],
    queryFn:  () => api.get(`/dashboard/analytics/user/${selectedId}/`).then(r => r.data),
    enabled:  selectedId !== null,
  })

  const selected = users.find(u => u.id === selectedId)
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
        <EmployeePicker users={users} selectedId={selectedId} onSelect={selectUser} />
      </div>

      {/* ── Empty state ── */}
      {!selectedId && (
        <div className="flex flex-col items-center justify-center h-64 rounded-xl border border-white/[0.06] bg-[#1a1a2e] gap-3">
          <div className="p-3 rounded-full bg-indigo-500/10">
            <Users className="h-6 w-6 text-indigo-400" />
          </div>
          <p className="text-sm font-medium text-slate-300">Select an employee to view their performance</p>
          <p className="text-xs text-slate-500">Use the dropdown above to choose a recruiter or team lead</p>
        </div>
      )}

      {/* ── Analytics ── */}
      {selectedId && (
        <>
          {/* Selected employee label */}
          {selected && (
            <p className="text-xs text-slate-500">
              Showing data for <span className="text-indigo-400 font-medium">{selected.first_name} {selected.last_name}</span>
            </p>
          )}

          {/* Row 1: Recruiter stats */}
          <RecruiterStatsWidget data={data?.recruiter_stats} loading={isLoading} />

          {/* Row 2: Source effectiveness | Open jobs */}
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

          {/* Row 3: Pipeline funnel | Interview outcomes */}
          <div className="grid grid-cols-2 gap-4">
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
