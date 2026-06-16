import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@/api/client'

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

const ACTION_COLORS: Record<string, string> = {
  create: 'text-green-700 bg-green-50 border-green-200',
  update: 'text-amber-700 bg-amber-50 border-amber-200',
  delete: 'text-red-700 bg-red-50 border-red-200',
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
        <h1 className="text-xl font-semibold text-gray-900">Audit Log</h1>
        {data && (
          <span className="text-sm text-gray-400">{data.count} entries</span>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={model}
          onChange={handleFilterChange(setModel)}
          className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All models</option>
          {MODEL_OPTIONS.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <select
          value={action}
          onChange={handleFilterChange(setAction)}
          className="text-sm border border-gray-200 rounded-md px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All actions</option>
          {ACTION_OPTIONS.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading && (
          <div className="py-10 text-center text-sm text-gray-400">Loading…</div>
        )}

        {isError && (
          <div className="py-10 text-center text-sm text-red-500">Failed to load activity log.</div>
        )}

        {!isLoading && !isError && data?.results.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-400">No entries found.</div>
        )}

        {!isLoading && !isError && (data?.results.length ?? 0) > 0 && (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100">
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Model</th>
                <th className="px-4 py-3 font-medium">Object</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data?.results.map(entry => (
                <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(entry.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {entry.user ?? <span className="text-gray-400 font-normal">deleted</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${ACTION_COLORS[entry.action] ?? 'text-gray-600 bg-gray-50 border-gray-200'}`}>
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{entry.model_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{entry.object_id || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${entry.status_code < 300 ? 'text-green-700' : 'text-red-600'}`}>
                      {entry.status_code}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{entry.ip_address ?? '—'}</td>
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
            className="px-3 py-1.5 rounded border border-gray-200 text-gray-600 disabled:opacity-40 hover:bg-gray-50"
          >
            Previous
          </button>
          <span className="text-gray-400">Page {page} of {totalPages}</span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 rounded border border-gray-200 text-gray-600 disabled:opacity-40 hover:bg-gray-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}
