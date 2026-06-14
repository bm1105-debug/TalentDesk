// What this file does: unified search across candidates, jobs, and clients.
// Results are fetched on every keystroke (debounced by TanStack Query's staleTime).
// Three columns show results side-by-side; clicking a result navigates to that section.

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Search as SearchIcon, Users, Briefcase, Building2 } from 'lucide-react'
import api from '@/api/client'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

// ── Types ──────────────────────────────────────────────────────────────────────

interface CandidateResult {
  id: number; full_name: string; email: string; current_title: string; status: string
}
interface JobResult {
  id: number; title: string; client_name: string; status: string; priority: string
}
interface ClientResult {
  id: number; name: string; industry: string; status: string
}
interface SearchResults {
  candidates: CandidateResult[]
  jobs:       JobResult[]
  clients:    ClientResult[]
}

// ── Result card components ─────────────────────────────────────────────────────

function CandidateCard({ c, onClick }: { c: CandidateResult; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-100">
      <p className="text-sm font-medium text-gray-900">{c.full_name}</p>
      <p className="text-xs text-gray-500">{c.current_title || c.email}</p>
      <Badge variant="secondary" className="mt-1 text-[10px]">{c.status}</Badge>
    </button>
  )
}

function JobCard({ j, onClick }: { j: JobResult; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-100">
      <p className="text-sm font-medium text-gray-900">{j.title}</p>
      <p className="text-xs text-gray-500">{j.client_name}</p>
      <div className="flex gap-1 mt-1">
        <Badge variant="secondary" className="text-[10px]">{j.status}</Badge>
        <Badge variant="secondary" className="text-[10px]">{j.priority}</Badge>
      </div>
    </button>
  )
}

function ClientCard({ c, onClick }: { c: ClientResult; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-100">
      <p className="text-sm font-medium text-gray-900">{c.name}</p>
      <p className="text-xs text-gray-500">{c.industry}</p>
      <Badge variant="secondary" className="mt-1 text-[10px]">{c.status}</Badge>
    </button>
  )
}

function SectionHeader({ icon: Icon, label, count }: {
  icon: React.ElementType; label: string; count: number
}) {
  return (
    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
      <Icon className="h-4 w-4 text-gray-400" />
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      <span className="ml-auto text-xs text-gray-400">{count} result{count !== 1 ? 's' : ''}</span>
    </div>
  )
}

function EmptySection({ message }: { message: string }) {
  return <p className="text-xs text-gray-400 py-4 text-center">{message}</p>
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Search() {
  const [q, setQ] = useState('')
  const navigate   = useNavigate()

  const trimmed = q.trim()

  const { data, isFetching } = useQuery<SearchResults>({
    queryKey: ['search', trimmed],
    queryFn:  () => api.get('/search/', { params: { q: trimmed } }).then(r => r.data),
    enabled:  trimmed.length >= 2,   // don't search for 0 or 1 character
    staleTime: 1000 * 30,
  })

  const hasResults = data && (
    data.candidates.length + data.jobs.length + data.clients.length > 0
  )

  return (
    <div className="space-y-6 max-w-5xl">

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Search</h1>
      </div>

      {/* Search input */}
      <div className="relative max-w-lg">
        <SearchIcon className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
        <Input
          className="pl-10 h-10 text-base"
          placeholder="Search candidates, jobs, clients…"
          value={q}
          onChange={e => setQ(e.target.value)}
          autoFocus
        />
        {isFetching && (
          <span className="absolute right-3 top-3 text-xs text-gray-400">Searching…</span>
        )}
      </div>

      {/* Prompt before search */}
      {trimmed.length < 2 && (
        <p className="text-sm text-gray-400">Type at least 2 characters to search.</p>
      )}

      {/* No results */}
      {trimmed.length >= 2 && !isFetching && !hasResults && (
        <p className="text-sm text-gray-400">No results for "{trimmed}".</p>
      )}

      {/* Results grid */}
      {hasResults && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          {/* Candidates */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <SectionHeader icon={Users} label="Candidates" count={data.candidates.length} />
            {data.candidates.length === 0
              ? <EmptySection message="No candidates" />
              : data.candidates.map(c => (
                  <CandidateCard key={c.id} c={c}
                    onClick={() => navigate('/candidates')} />
                ))
            }
          </div>

          {/* Jobs */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <SectionHeader icon={Briefcase} label="Jobs" count={data.jobs.length} />
            {data.jobs.length === 0
              ? <EmptySection message="No jobs" />
              : data.jobs.map(j => (
                  <JobCard key={j.id} j={j}
                    onClick={() => navigate('/jobs')} />
                ))
            }
          </div>

          {/* Clients */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <SectionHeader icon={Building2} label="Clients" count={data.clients.length} />
            {data.clients.length === 0
              ? <EmptySection message="No clients" />
              : data.clients.map(c => (
                  <ClientCard key={c.id} c={c}
                    onClick={() => navigate('/candidates')} />
                ))
            }
          </div>

        </div>
      )}
    </div>
  )
}
