import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart2 } from 'lucide-react'
import api from '@/api/client'
import { EmptyState } from '@/components/EmptyState'

// ── Types ──────────────────────────────────────────────────────────────────────

interface JobOption {
  id: number
  title: string
  client_name: string
  status: string
}

interface StageCount {
  name: string
  count: number
}

interface PipelineReport {
  job: { id: number; title: string; client: string; status: string }
  stages: StageCount[]
  outcomes: { active: number; placed: number; rejected: number; withdrawn: number }
  total: number
}

// ── Outcome card ──────────────────────────────────────────────────────────────

function OutcomeCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <p className="text-2xl font-bold">{count}</p>
      <p className="text-sm mt-0.5 capitalize">{label}</p>
    </div>
  )
}

// ── Pipeline bar ──────────────────────────────────────────────────────────────

function StageBar({ name, count, max }: { name: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-slate-300 font-medium">{name}</span>
        <span className="text-slate-500">{count}</span>
      </div>
      <div className="h-2.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Reports() {
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null)

  const { data: jobs } = useQuery<{ results: JobOption[] }>({
    queryKey: ['jobs-for-report'],
    queryFn: () => api.get('/jobs/', { params: { page_size: 200 } }).then(r => r.data),
  })

  const { data: report, isLoading: reportLoading } = useQuery<PipelineReport>({
    queryKey: ['pipeline-report', selectedJobId],
    queryFn: () => api.get(`/jobs/${selectedJobId}/pipeline-report/`).then(r => r.data),
    enabled: selectedJobId !== null,
  })

  const maxCount = report ? Math.max(...report.stages.map(s => s.count), 1) : 1

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-400">View pipeline metrics by job</p>

      {/* ── Job selector ── */}
      <div className="bg-[#0d1117] rounded-xl border border-white/[0.06] p-4 flex items-center gap-3">
        <label className="text-sm font-medium text-slate-300 shrink-0">Select job</label>
        <select
          className="flex-1 h-9 rounded-lg border border-white/[0.12] bg-[#0d1117] px-3 text-sm hover:border-white/[0.25] hover:bg-[#1e1e36] transition-colors"
          value={selectedJobId ?? ''}
          onChange={e => setSelectedJobId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">— Choose a job —</option>
          {jobs?.results.map(j => (
            <option key={j.id} value={j.id}>
              {j.title} · {j.client_name} ({j.status})
            </option>
          ))}
        </select>
      </div>

      {/* ── Empty state ── */}
      {!selectedJobId && (
        <div className="bg-[#0d1117] rounded-xl border border-white/[0.07] min-h-[280px] flex items-center justify-center">
          <EmptyState
            icon={BarChart2}
            title="Select a job to view its pipeline"
            description="Choose a job from the dropdown above to see hiring metrics."
          />
        </div>
      )}

      {/* ── Loading ── */}
      {selectedJobId && reportLoading && (
        <div className="bg-[#0d1117] rounded-xl border border-white/[0.06] py-16 text-center text-slate-500 text-sm">
          Loading…
        </div>
      )}

      {/* ── Report ── */}
      {report && !reportLoading && (
        <div className="space-y-6">

          {/* Outcome summary */}
          <div className="grid grid-cols-4 gap-4">
            <OutcomeCard label="Active"    count={report.outcomes.active}    color="bg-indigo-500/10 border-indigo-500/20 text-indigo-300" />
            <OutcomeCard label="Placed"    count={report.outcomes.placed}    color="bg-green-500/10 border-green-500/20 text-green-300" />
            <OutcomeCard label="Rejected"  count={report.outcomes.rejected}  color="bg-red-500/10 border-red-500/20 text-red-300" />
            <OutcomeCard label="Withdrawn" count={report.outcomes.withdrawn} color="bg-white/[0.04] border-white/[0.06] text-slate-300" />
          </div>

          {/* Pipeline stage breakdown */}
          <div className="bg-[#0d1117] rounded-xl border border-white/[0.06] p-6 space-y-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold text-slate-100">Pipeline breakdown</h2>
              <span className="text-sm text-slate-500">{report.total} total candidates</span>
            </div>

            {report.stages.length === 0 ? (
              <p className="text-sm text-slate-500">No pipeline stages defined for this job.</p>
            ) : (
              <div className="space-y-3">
                {report.stages.map(s => (
                  <StageBar key={s.name} name={s.name} count={s.count} max={maxCount} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
