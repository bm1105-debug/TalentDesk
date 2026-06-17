import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, Users, Briefcase, Building2, Clock } from 'lucide-react'
import api from '@/api/client'

// ── Types ──────────────────────────────────────────────────────────────────────

interface RecentEntry { path: string; label: string }

interface SearchResults {
  candidates: { id: number; full_name: string; current_title: string }[]
  jobs:       { id: number; title: string; client_name: string }[]
  clients:    { id: number; name: string; industry: string }[]
}

interface FlatResult { path: string; label: string; sub: string; icon: React.ElementType }

// ── LocalStorage helpers ──────────────────────────────────────────────────────

const RECENTS_KEY = 'command_bar_recents'
const MAX_RECENTS = 5

function loadRecents(): RecentEntry[] {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') } catch { return [] }
}

function saveRecent(entry: RecentEntry) {
  const prev    = loadRecents().filter(r => r.path !== entry.path)
  const updated = [entry, ...prev].slice(0, MAX_RECENTS)
  localStorage.setItem(RECENTS_KEY, JSON.stringify(updated))
}

// ── CommandBar component ───────────────────────────────────────────────────────

export default function CommandBar() {
  const [open,    setOpen]    = useState(false)
  const [query,   setQuery]   = useState('')
  const [focused, setFocused] = useState(0)
  const [debounced, setDebounced] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  // Open on Ctrl+K / Cmd+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      setFocused(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Debounce query 200ms
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 200)
    return () => clearTimeout(id)
  }, [query])

  const { data } = useQuery<SearchResults>({
    queryKey: ['command-bar-search', debounced],
    queryFn:  () => api.get('/search/', { params: { q: debounced } }).then(r => r.data),
    enabled:  debounced.length >= 2,
    staleTime: 30_000,
  })

  // Flatten results into a navigable list
  const results: FlatResult[] = debounced.length >= 2 && data ? [
    ...data.candidates.map(c => ({
      path:  `/candidates/${c.id}`,
      label: c.full_name,
      sub:   c.current_title || 'Candidate',
      icon:  Users,
    })),
    ...data.jobs.map(j => ({
      path:  `/jobs/${j.id}`,
      label: j.title,
      sub:   j.client_name,
      icon:  Briefcase,
    })),
    ...data.clients.map(c => ({
      path:  `/candidates`, // clients list doesn't have a detail page yet
      label: c.name,
      sub:   c.industry || 'Client',
      icon:  Building2,
    })),
  ] : []

  const recents = loadRecents()

  const goTo = useCallback((path: string, label: string) => {
    saveRecent({ path, label })
    navigate(path)
    setOpen(false)
  }, [navigate])

  // Keyboard navigation inside the overlay
  function onKeyDown(e: React.KeyboardEvent) {
    const list = results.length > 0 ? results : recents.map(r => ({ ...r, sub: 'Recent', icon: Clock }))
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocused(f => Math.min(f + 1, list.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocused(f => Math.max(f - 1, 0))
    } else if (e.key === 'Enter' && list[focused]) {
      const item = list[focused]
      goTo(item.path, item.label)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  if (!open) return null

  const showRecents = debounced.length < 2
  const displayList: FlatResult[] = showRecents
    ? recents.map(r => ({ path: r.path, label: r.label, sub: 'Recent', icon: Clock }))
    : results

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/40 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setFocused(0) }}
            onKeyDown={onKeyDown}
            placeholder="Search candidates, jobs, clients…"
            className="flex-1 text-sm outline-none bg-transparent text-gray-900 placeholder-gray-400"
          />
          <kbd className="text-[10px] text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto py-1">
          {showRecents && recents.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6">
              Type to search candidates, jobs, and clients
            </p>
          )}

          {showRecents && recents.length > 0 && (
            <div className="px-2 pt-1 pb-0.5">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider px-2 mb-1">Recent</p>
            </div>
          )}

          {!showRecents && results.length === 0 && debounced.length >= 2 && (
            <p className="text-xs text-gray-400 text-center py-6">No results for "{debounced}"</p>
          )}

          {displayList.map((item, i) => {
            const Icon = item.icon
            return (
              <button
                key={`${item.path}-${i}`}
                onClick={() => goTo(item.path, item.label)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  focused === i ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
                onMouseEnter={() => setFocused(i)}
              >
                <div className="p-1.5 rounded-lg bg-gray-100 shrink-0">
                  <Icon className="h-3.5 w-3.5 text-gray-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.label}</p>
                  <p className="text-xs text-gray-400 truncate">{item.sub}</p>
                </div>
              </button>
            )
          })}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-4 text-[10px] text-gray-400">
          <span><kbd className="bg-gray-100 rounded px-1">↑↓</kbd> navigate</span>
          <span><kbd className="bg-gray-100 rounded px-1">↵</kbd> open</span>
          <span><kbd className="bg-gray-100 rounded px-1">Ctrl+K</kbd> toggle</span>
        </div>
      </div>
    </div>
  )
}
