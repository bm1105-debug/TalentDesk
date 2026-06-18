const STYLES: Record<string, string> = {
  // green
  open:        'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25',
  active:      'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25',
  create:      'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25',
  // red
  urgent:      'bg-red-500/15 text-red-300 border border-red-500/25',
  rejected:    'bg-red-500/15 text-red-300 border border-red-500/25',
  declined:    'bg-red-500/15 text-red-300 border border-red-500/25',
  // indigo
  scheduled:   'bg-indigo-500/15 text-indigo-300 border border-indigo-500/25',
  screening:   'bg-indigo-500/15 text-indigo-300 border border-indigo-500/25',
  submitted:   'bg-indigo-500/15 text-indigo-300 border border-indigo-500/25',
  shortlisted: 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/25',
  // amber
  medium:      'bg-amber-500/15 text-amber-300 border border-amber-500/25',
  interview:   'bg-amber-500/15 text-amber-300 border border-amber-500/25',
  pending:     'bg-amber-500/15 text-amber-300 border border-amber-500/25',
  // slate
  low:         'bg-slate-500/15 text-slate-400 border border-slate-500/25',
  passive:     'bg-slate-500/15 text-slate-400 border border-slate-500/25',
  withdrawn:   'bg-slate-500/15 text-slate-400 border border-slate-500/25',
  closed:      'bg-slate-500/15 text-slate-400 border border-slate-500/25',
  inactive:    'bg-slate-500/15 text-slate-400 border border-slate-500/25',
  // cyan
  filled:      'bg-cyan-500/15 text-cyan-300 border border-cyan-500/25',
  placed:      'bg-cyan-500/15 text-cyan-300 border border-cyan-500/25',
  accepted:    'bg-cyan-500/15 text-cyan-300 border border-cyan-500/25',
  // orange
  no_show:     'bg-orange-500/15 text-orange-300 border border-orange-500/25',
  overdue:     'bg-orange-500/15 text-orange-300 border border-orange-500/25',
  // interview types
  phone:       'bg-indigo-500/15 text-indigo-300 border border-indigo-500/25',
  video:       'bg-indigo-500/15 text-indigo-300 border border-indigo-500/25',
  onsite:      'bg-cyan-500/15 text-cyan-300 border border-cyan-500/25',
  technical:   'bg-amber-500/15 text-amber-300 border border-amber-500/25',
  panel:       'bg-violet-500/15 text-violet-300 border border-violet-500/25',
}

const BASE = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide capitalize'

export function StatusBadge({ status }: { status: string }) {
  const key = status?.toLowerCase().replace(/\s+/g, '_')
  const style = STYLES[key] ?? 'bg-slate-500/15 text-slate-400 border border-slate-500/25'
  return <span className={`${BASE} ${style}`}>{status.replace(/_/g, ' ')}</span>
}
