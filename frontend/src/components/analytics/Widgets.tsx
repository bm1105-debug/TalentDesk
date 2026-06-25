// Shared analytics widget components used by Analytics.tsx and People.tsx

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
  BarChart, Bar, Legend,
} from 'recharts'

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

export interface TimeToFillTrendPoint {
  month: string
  avg_days: number
  count: number
}

export interface TimeToFillTrend {
  trend:    TimeToFillTrendPoint[]
  avg_days: number | null
}

export interface DeclineReason {
  reason:  string
  label:   string
  count:   number
  percent: number
}

export interface DeclineReasons {
  reasons: DeclineReason[]
  total:   number
}

export interface DiversityRow {
  client_id:        number
  client:           string
  female:           number
  male:             number
  non_binary:       number
  prefer_not_to_say: number
}

export interface DiversityTotals {
  female:           number
  male:             number
  non_binary:       number
  prefer_not_to_say: number
}

export interface Diversity {
  by_client: DiversityRow[]
  totals:    DiversityTotals
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
  return <div className={`animate-pulse bg-white/10 rounded ${className}`} />
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
    <div className="bg-[#0d1117] rounded-xl border border-white/[0.06] p-5">
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
    <div className="bg-[#0d1117] rounded-xl border border-white/[0.06] p-5">
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
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-slate-300 text-sm">
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
            background: 'linear-gradient(90deg, #1d4ed8, #3b82f6)',
            boxShadow: '0 0 8px rgba(37,99,235,0.35)',
          }}
        />
        {entry.placements > 0 && (
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
            style={{ width: `${placedPct}%`, background: 'rgba(96,165,250,0.85)' }}
          />
        )}
      </div>
    </div>
  )
}

// ── Open jobs ──────────────────────────────────────────────────────────────────

function CountRow({ label, value, highlight, dot }: { label: string; value: number; highlight?: boolean; dot?: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2">
        {dot && <span className="inline-block h-2 w-2 rounded-full flex-shrink-0" style={{ background: dot }} />}
        <span className="text-sm text-slate-400 capitalize">{label.replace('_', ' ')}</span>
      </div>
      <span className={`text-sm font-semibold shrink-0 ${highlight ? 'text-red-400' : 'text-slate-100'}`}>{value}</span>
    </div>
  )
}

export function OpenJobsWidget({ data }: { data: OpenJobs }) {
  const totalJobs = Object.values(data.by_status).reduce((a, b) => a + b, 0)
  if (totalJobs === 0) return <Empty />
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">By Status</p>
        <div className="divide-y divide-white/[0.04]">
          <CountRow label="Open"    value={data.by_status.open}   dot="#2563eb" />
          <CountRow label="On Hold" value={data.by_status.on_hold} dot="#f59e0b" />
          <CountRow label="Draft"   value={data.by_status.draft}   dot="#64748b" />
          <CountRow label="Filled"  value={data.by_status.filled}  dot="#3b82f6" />
        </div>
      </div>
      <div className="border-t border-white/[0.06] pt-3">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">By Priority</p>
        <div className="divide-y divide-white/[0.04]">
          <CountRow label="Urgent" value={data.by_priority.urgent} highlight={data.by_priority.urgent > 0} dot="#ef4444" />
          <CountRow label="High"   value={data.by_priority.high}   dot="#f97316" />
          <CountRow label="Medium" value={data.by_priority.medium} dot="#f59e0b" />
          <CountRow label="Low"    value={data.by_priority.low}    dot="#64748b" />
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
            <div className="h-2.5 w-full bg-white/10 rounded-full overflow-hidden">
              <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #1d4ed8, #3b82f6)' }}
            />
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
          { label: 'Completed', value: data.completed, color: '#2563eb' },
          { label: 'Cancelled', value: data.cancelled, color: '#f59e0b' },
          { label: 'No Show',   value: data.no_show,   color: '#ef4444' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg p-3" style={{
            background: `linear-gradient(135deg, ${color}14 0%, rgba(255,255,255,0.012) 100%)`,
            border:     '1px solid rgba(255,255,255,0.07)',
            borderLeft: `3px solid ${color}`,
          }}>
            <p className="text-xl font-bold" style={{ color }}>{value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{label}</p>
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

// ── Time to fill trend (Recharts AreaChart) ────────────────────────────────────

const TREND_TOOLTIP_STYLE = {
  contentStyle: {
    background: '#0d1117',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    color: '#f1f5f9',
    fontSize: 12,
  },
  labelStyle: { color: '#94a3b8', marginBottom: 4 },
  itemStyle: { color: '#a5b4fc' },
}

export function TimeToFillTrendWidget({ data }: { data: TimeToFillTrend }) {
  if (data.trend.length === 0) return <Empty />
  return (
    <div className="space-y-3">
      {data.avg_days !== null && (
        <div className="flex items-baseline gap-2 pb-3 border-b border-white/[0.06]">
          <span className="text-2xl font-bold text-slate-100">{data.avg_days}</span>
          <span className="text-sm text-slate-500">days avg to fill (last 6 months)</span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data.trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="ttfGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#2563eb" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="month"
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${v}d`}
          />
          <Tooltip
            {...TREND_TOOLTIP_STYLE}
            formatter={(value) => [`${value} days`, 'Avg time to fill']}
          />
          <Area
            type="monotone"
            dataKey="avg_days"
            stroke="#2563eb"
            strokeWidth={2}
            fill="url(#ttfGradient)"
            dot={{ fill: '#3b82f6', r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#93c5fd', strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
      <p className="text-xs text-slate-600 text-right">{data.trend.length} month{data.trend.length !== 1 ? 's' : ''} of data</p>
    </div>
  )
}

// ── Decline reasons (PieChart) ────────────────────────────────────────────────

const REASON_COLORS: Record<string, string> = {
  salary:     '#1d4ed8',
  experience: '#2563eb',
  technical:  '#3b82f6',
  culture:    '#f59e0b',
  other:      '#64748b',
}

const PIE_TOOLTIP_STYLE = {
  contentStyle: {
    background: '#0d1117',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    color: '#f1f5f9',
    fontSize: 12,
  },
  itemStyle: { color: '#a5b4fc' },
}

function DeclineLegend({ reasons }: { reasons: DeclineReason[] }) {
  return (
    <div className="space-y-2 mt-2">
      {reasons.map(r => (
        <div key={r.reason} className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full flex-shrink-0"
              style={{ background: REASON_COLORS[r.reason] ?? '#64748b' }} />
            <span className="text-slate-400">{r.label}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-slate-500 text-xs">{r.count}</span>
            <span className="font-semibold text-slate-200 w-10 text-right">{r.percent}%</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export function DeclineReasonsWidget({ data }: { data: DeclineReasons }) {
  if (data.total === 0) return <Empty />
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-2 pb-3 border-b border-white/[0.06]">
        <span className="text-2xl font-bold text-slate-100">{data.total}</span>
        <span className="text-sm text-slate-500">rejections with structured reason</span>
      </div>
      <div className="flex gap-4 items-center">
        <ResponsiveContainer width={160} height={160}>
          <PieChart>
            <Pie
              data={data.reasons}
              dataKey="count"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={72}
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.reasons.map(r => (
                <Cell key={r.reason} fill={REASON_COLORS[r.reason] ?? '#64748b'} />
              ))}
            </Pie>
            <Tooltip
              {...PIE_TOOLTIP_STYLE}
              formatter={(value, name) => [`${value} (${data.reasons.find(r => r.label === name)?.percent ?? 0}%)`, name]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 min-w-0">
          <DeclineLegend reasons={data.reasons} />
        </div>
      </div>
    </div>
  )
}

// ── Diversity breakdown (stacked BarChart) ─────────────────────────────────────

const DIVERSITY_COLORS = {
  female:            '#3b82f6',
  male:              '#1d4ed8',
  non_binary:        '#60a5fa',
  prefer_not_to_say: '#475569',
}

const DIVERSITY_LABELS = {
  female:            'Female',
  male:              'Male',
  non_binary:        'Non-binary',
  prefer_not_to_say: 'Prefer not to say',
}

const DIV_TOOLTIP_STYLE = {
  contentStyle: {
    background: '#0d1117',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    color: '#f1f5f9',
    fontSize: 12,
  },
  labelStyle: { color: '#94a3b8', marginBottom: 4 },
}

export function DiversityWidget({ data }: { data: Diversity }) {
  if (data.by_client.length === 0) return <Empty />

  const total = Object.values(data.totals).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-4">
      {/* Totals strip */}
      <div className="grid grid-cols-4 gap-3 pb-3 border-b border-white/[0.06]">
        {(Object.keys(DIVERSITY_COLORS) as Array<keyof typeof DIVERSITY_COLORS>).map(g => (
          <div key={g} className="rounded-lg p-3" style={{
            background: `linear-gradient(135deg, ${DIVERSITY_COLORS[g]}14 0%, rgba(255,255,255,0.012) 100%)`,
            border:     '1px solid rgba(255,255,255,0.07)',
            borderLeft: `3px solid ${DIVERSITY_COLORS[g]}`,
          }}>
            <p className="text-xl font-bold" style={{ color: DIVERSITY_COLORS[g] }}>{data.totals[g]}</p>
            <p className="text-xs text-slate-400 mt-0.5">{DIVERSITY_LABELS[g]}</p>
            {total > 0 && (
              <p className="text-xs mt-1" style={{ color: DIVERSITY_COLORS[g], opacity: 0.7 }}>
                {Math.round(data.totals[g] / total * 100)}%
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Stacked bar chart per client */}
      <ResponsiveContainer width="100%" height={data.by_client.length * 52 + 40}>
        <BarChart
          data={data.by_client}
          layout="vertical"
          margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
          barSize={18}
        >
          <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            type="number"
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="client"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={90}
          />
          <Tooltip {...DIV_TOOLTIP_STYLE} />
          <Legend
            wrapperStyle={{ fontSize: 11, color: '#64748b', paddingTop: 8 }}
            formatter={(value) => DIVERSITY_LABELS[value as keyof typeof DIVERSITY_LABELS] ?? value}
          />
          {(Object.keys(DIVERSITY_COLORS) as Array<keyof typeof DIVERSITY_COLORS>).map(g => (
            <Bar key={g} dataKey={g} stackId="div" fill={DIVERSITY_COLORS[g]} name={g} radius={g === 'prefer_not_to_say' ? [0, 3, 3, 0] : [0, 0, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Time to fill (by job, bar list) ───────────────────────────────────────────

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
              <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
