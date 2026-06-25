import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@/api/client'
import { StatusBadge } from '@/components/StatusBadge'

// ── Types ──────────────────────────────────────────────────────────────────────

interface LogEntry {
  id: number
  user: string | null
  action: string
  method: string
  endpoint: string
  model_name: string
  object_id: string
  status_code: number
  ip_address: string | null
  created_at: string
}

interface PaginatedLog {
  count: number
  next: string | null
  previous: string | null
  results: LogEntry[]
}

const MODEL_OPTIONS = [
  'candidates', 'jobs', 'submittals', 'interviews',
  'communications', 'clients', 'users', 'attachments',
]

const ACTION_OPTIONS = ['create', 'update', 'delete']

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ActivityLog() {
  const [model, setModel]   = useState('')
  const [action, setAction] = useState('')
  const [page, setPage]     = useState(1)

  const params: Record<string, string | number> = { page }
  if (model)  params.model  = model
  if (action) params.action = action

  const { data, isLoading, isError } = useQuery<PaginatedLog>({
    queryKey: ['activity', model, action, page],
    queryFn: () => api.get('/activity/', { params }).then(r => r.data),
  })

  function handleFilterChange(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLSelectElement>) => {
      setter(e.target.value)
      setPage(1)
    }
  }

  const totalPages = data ? Math.ceil(data.count / 20) : 1

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        {data && (
          <span className="text-sm text-slate-500">{data.count} entries</span>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={model}
          onChange={handleFilterChange(setModel)}
          className="text-sm border border-white/[0.06] rounded-md px-3 py-1.5 bg-[#0d1117] text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All models</option>
          {MODEL_OPTIONS.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <select
          value={action}
          onChange={handleFilterChange(setAction)}
          className="text-sm border border-white/[0.06] rounded-md px-3 py-1.5 bg-[#0d1117] text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All actions</option>
          {ACTION_OPTIONS.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-[#0d1117] rounded-xl border border-white/[0.06] overflow-hidden" style={{ borderTop: '2px solid #2563eb' }}>
        {isLoading && (
          <div className="py-10 text-center text-sm text-slate-500">Loading…</div>
        )}

        {isError && (
          <div className="py-10 text-center text-sm text-red-400">Failed to load activity log.</div>
        )}

        {!isLoading && !isError && data?.results.length === 0 && (
          <div className="py-10 text-center text-sm text-slate-500">No entries found.</div>
        )}

        {!isLoading && !isError && (data?.results.length ?? 0) > 0 && (
          <table className="w-full text-sm">
            <thead className="bg-white/[0.04] border-b border-white/[0.06]">
              <tr className="text-left text-xs text-slate-400 tracking-wide">
                <th className="px-4 py-3 font-semibold">Time</th>
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Model</th>
                <th className="px-4 py-3 font-semibold">Object</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {data?.results.map(entry => (
                <tr key={entry.id} className="hover:bg-white/[0.03] transition-colors">
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {new Date(entry.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-100">
                    {entry.user ?? <span className="text-slate-500 font-normal">deleted</span>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={entry.action} />
                  </td>
                  <td className="px-4 py-3 text-slate-400">{entry.model_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{entry.object_id || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${entry.status_code < 300 ? 'text-green-400' : 'text-red-400'}`}>
                      {entry.status_code}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{entry.ip_address ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 rounded border border-white/[0.06] text-slate-400 disabled:opacity-40 hover:bg-white/[0.03]"
          >
            Previous
          </button>
          <span className="text-slate-500">Page {page} of {totalPages}</span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 rounded border border-white/[0.06] text-slate-400 disabled:opacity-40 hover:bg-white/[0.03]"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
