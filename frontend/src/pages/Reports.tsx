import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@/api/client'

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
        <span className="text-gray-700 font-medium">{name}</span>
        <span className="text-gray-500">{count}</span>
      </div>
      <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-500"
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
      <h1 className="text-xl font-semibold text-gray-900">Reports</h1>

      {/* ── Job selector ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 shrink-0">Select job</label>
        <select
          className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
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
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400 text-sm">
          Select a job above to see its pipeline report.
        </div>
      )}

      {/* ── Loading ── */}
      {selectedJobId && reportLoading && (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400 text-sm">
          Loading…
        </div>
      )}

      {/* ── Report ── */}
      {report && !reportLoading && (
        <div className="space-y-6">

          {/* Outcome summary */}
          <div className="grid grid-cols-4 gap-4">
            <OutcomeCard label="Active"    count={report.outcomes.active}    color="bg-blue-50 border-blue-200 text-blue-800" />
            <OutcomeCard label="Placed"    count={report.outcomes.placed}    color="bg-green-50 border-green-200 text-green-800" />
            <OutcomeCard label="Rejected"  count={report.outcomes.rejected}  color="bg-red-50 border-red-200 text-red-800" />
            <OutcomeCard label="Withdrawn" count={report.outcomes.withdrawn} color="bg-gray-50 border-gray-200 text-gray-700" />
          </div>

          {/* Pipeline stage breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold text-gray-900">Pipeline breakdown</h2>
              <span className="text-sm text-gray-400">{report.total} total candidates</span>
            </div>

            {report.stages.length === 0 ? (
              <p className="text-sm text-gray-400">No pipeline stages defined for this job.</p>
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
