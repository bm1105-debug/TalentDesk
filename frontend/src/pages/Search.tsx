// What this file does: unified search across candidates, jobs, and clients.
// Results are fetched on every keystroke (debounced by TanStack Query's staleTime).
// Three columns show results side-by-side; clicking a result navigates to that section.

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Search as SearchIcon, Users, Briefcase, Building2 } from 'lucide-react'
import api from '@/api/client'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/StatusBadge'

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
  candidates:   CandidateResult[]
  jobs:         JobResult[]
  clients:      ClientResult[]
  parsed_query: string | null
}

// ── Result card components ─────────────────────────────────────────────────────

function CandidateCard({ c, onClick }: { c: CandidateResult; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-indigo-500/10 transition-colors border border-transparent hover:border-indigo-500/20">
      <p className="text-sm font-medium text-slate-100">{c.full_name}</p>
      <p className="text-xs text-slate-500">{c.current_title || c.email}</p>
      <div className="mt-1"><StatusBadge status={c.status} /></div>
    </button>
  )
}

function JobCard({ j, onClick }: { j: JobResult; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-indigo-500/10 transition-colors border border-transparent hover:border-indigo-500/20">
      <p className="text-sm font-medium text-slate-100">{j.title}</p>
      <p className="text-xs text-slate-500">{j.client_name}</p>
      <div className="flex gap-1 mt-1">
        <StatusBadge status={j.status} />
        <StatusBadge status={j.priority} />
      </div>
    </button>
  )
}

function ClientCard({ c, onClick }: { c: ClientResult; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-indigo-500/10 transition-colors border border-transparent hover:border-indigo-500/20">
      <p className="text-sm font-medium text-slate-100">{c.name}</p>
      <p className="text-xs text-slate-500">{c.industry}</p>
      <div className="mt-1"><StatusBadge status={c.status} /></div>
    </button>
  )
}

function SectionHeader({ icon: Icon, label, count }: {
  icon: React.ElementType; label: string; count: number
}) {
  return (
    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
      <Icon className="h-4 w-4 text-slate-500" />
      <span className="text-sm font-semibold text-slate-300">{label}</span>
      <span className="ml-auto text-xs text-slate-500">{count} result{count !== 1 ? 's' : ''}</span>
    </div>
  )
}

function EmptySection({ message }: { message: string }) {
  return <p className="text-xs text-slate-500 py-4 text-center">{message}</p>
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


      {/* Search input */}
      <div className="relative max-w-lg">
        <SearchIcon className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-500" />
        <Input
          className="pl-11 h-12 text-lg bg-[#1a1a2e] border-white/[0.15] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50"
          placeholder="Search candidates, jobs, clients…"
          value={q}
          onChange={e => setQ(e.target.value)}
          autoFocus
        />
        {isFetching && (
          <span className="absolute right-3 top-3.5 text-xs text-slate-500">Searching…</span>
        )}
      </div>

      {/* Boolean parsed_query hint */}
      {data?.parsed_query && (
        <p className="text-xs text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-md px-3 py-1.5 max-w-lg">
          Interpreted as: <span className="font-mono font-medium">{data.parsed_query}</span>
        </p>
      )}

      {/* Empty state */}
      {trimmed.length < 2 && (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <SearchIcon className="h-8 w-8 text-slate-600" />
          <p className="text-sm text-slate-500">Search across candidates, jobs, and clients</p>
        </div>
      )}

      {/* No results */}
      {trimmed.length >= 2 && !isFetching && !hasResults && (
        <p className="text-sm text-slate-500">No results for "{trimmed}".</p>
      )}

      {/* Results grid */}
      {hasResults && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          {/* Candidates */}
          <div className="bg-[#1a1a2e] rounded-xl border border-white/[0.06] p-4">
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
          <div className="bg-[#1a1a2e] rounded-xl border border-white/[0.06] p-4">
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
          <div className="bg-[#1a1a2e] rounded-xl border border-white/[0.06] p-4">
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
