// Shared analytics widget components used by Analytics.tsx and People.tsx

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CandidatePool {
  active: number
  passive: number
  placed: number
  blacklisted: number
}

export interface SourceEntry {
  source: string
  candidates: number
  placements: number
}

export interface FunnelStage {
  stage: string
  count: number
}

export interface InterviewOutcomes {
  completed: number
  cancelled: number
  no_show: number
  avg_score: number | null
}

export interface OpenJobs {
  by_status:   { open: number; on_hold: number; draft: number; filled: number }
  by_priority: { urgent: number; high: number; medium: number; low: number }
}

export interface TimeToFillJob {
  id: number
  title: string
  client: string
  days: number
}

export interface TimeToFill {
  avg_days: number | null
  by_job: TimeToFillJob[]
}

export const SOURCE_LABELS: Record<string, string> = {
  linkedin:  'LinkedIn',
  referral:  'Referral',
  job_board: 'Job Board',
  direct:    'Direct',
  other:     'Other',
}

// ── Primitives ─────────────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
}

export function Empty() {
  return <p className="text-sm text-slate-500">No data yet</p>
}

export function WidgetCard({ title, children, loading }: {
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

export function StatCard({ label, value, loading }: { label: string; value?: number | null; loading: boolean }) {
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

// ── Source effectiveness ───────────────────────────────────────────────────────

export function SourceBar({ entry, max }: { entry: SourceEntry; max: number }) {
  const candidatePct = max > 0 ? Math.round((entry.candidates / max) * 100) : 0
  const placedPct    = max > 0 ? Math.round((entry.placements  / max) * 100) : 0
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
      <div className="relative h-2.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{
            width: `${candidatePct}%`,
            background: 'linear-gradient(90deg, #7c3aed, #3b82f6)',
            boxShadow: '0 0 8px rgba(124,58,237,0.35)',
          }}
        />
        {entry.placements > 0 && (
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
            style={{ width: `${placedPct}%`, background: 'rgba(16,185,129,0.75)' }}
          />
        )}
      </div>
    </div>
  )
}

// ── Open jobs ──────────────────────────────────────────────────────────────────

function CountRow({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-slate-400 capitalize">{label.replace('_', ' ')}</span>
      <span className={`text-sm font-semibold ${highlight ? 'text-red-600' : 'text-slate-100'}`}>{value}</span>
    </div>
  )
}

export function OpenJobsWidget({ data }: { data: OpenJobs }) {
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

// ── Pipeline funnel ────────────────────────────────────────────────────────────

export function PipelineFunnelWidget({ stages }: { stages: FunnelStage[] }) {
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
              <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Interview outcomes ─────────────────────────────────────────────────────────

export function InterviewOutcomesWidget({ data }: { data: InterviewOutcomes }) {
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

// ── Time to fill ───────────────────────────────────────────────────────────────

export function TimeToFillWidget({ data }: { data: TimeToFill }) {
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
                <div className="h-full bg-violet-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
