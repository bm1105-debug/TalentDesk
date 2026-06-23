import { useQuery } from '@tanstack/react-query'
import api from '@/api/client'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Stats {
  total: number
  active: number
  placed: number
  rejected: number
  withdrawn: number
  conversion_rate: number
}

interface PipelineRow {
  stage: string
  count: number
}

interface Placement {
  candidate: string
  job: string
  placed_at: string
}

interface ScorecardData {
  stats: Stats
  pipeline: PipelineRow[]
  recent_placements: Placement[]
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-white/10 rounded ${className}`} />
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, highlight }: {
  label: string
  value: number | string
  sub?: string
  highlight?: boolean
}) {
  return (
    <div className="bg-[#1a1a2e] rounded-xl border border-white/[0.06] p-5">
      <p className={`text-2xl font-bold ${highlight ? 'text-indigo-400' : 'text-slate-100'}`}>{value}</p>
      <p className="text-sm text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Scorecard() {
  const { data, isLoading } = useQuery<ScorecardData>({
    queryKey: ['scorecard'],
    queryFn: () => api.get('/dashboard/scorecard/').then(r => r.data),
  })

  const stats = data?.stats
  const pipeline = data?.pipeline ?? []
  const placements = data?.recent_placements ?? []
  const maxPipeline = Math.max(...pipeline.map(r => r.count), 1)

  return (
    <div className="space-y-6">

      {/* ── Stat cards ── */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-[#1a1a2e] rounded-xl border border-white/[0.06] p-5 space-y-2">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Total Submitted"  value={stats?.total ?? 0} />
          <StatCard label="Active"           value={stats?.active ?? 0} highlight />
          <StatCard label="Placed"           value={stats?.placed ?? 0} />
          <StatCard label="Rejected"         value={stats?.rejected ?? 0} />
          <StatCard label="Withdrawn"        value={stats?.withdrawn ?? 0} />
          <StatCard
            label="Conversion Rate"
            value={`${stats?.conversion_rate ?? 0}%`}
            sub="placements ÷ submitted"
            highlight={(stats?.conversion_rate ?? 0) > 0}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">

        {/* ── Pipeline breakdown ── */}
        <div className="bg-[#1a1a2e] rounded-xl border border-white/[0.06] p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">My Pipeline</h2>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : pipeline.length === 0 ? (
            <p className="text-sm text-slate-500">No active submittals in a stage yet</p>
          ) : (
            <div className="space-y-3">
              {pipeline.map(row => {
                const pct = Math.round((row.count / maxPipeline) * 100)
                return (
                  <div key={row.stage} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-slate-300">{row.stage}</span>
                      <span className="text-slate-500">{row.count}</span>
                    </div>
                    <div className="h-2 w-full bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Recent placements ── */}
        <div className="bg-[#1a1a2e] rounded-xl border border-white/[0.06] p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Recent Placements</h2>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          ) : placements.length === 0 ? (
            <p className="text-sm text-slate-500">No placements yet</p>
          ) : (
            <div className="space-y-3">
              {placements.map((p, i) => (
                <div key={i} className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-100 truncate">{p.candidate}</p>
                    <p className="text-xs text-slate-500 truncate">{p.job}</p>
                  </div>
                  <span className="text-xs text-slate-500 shrink-0 mt-0.5">
                    {new Date(p.placed_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
