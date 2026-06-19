// What this file does: paginated candidate list with search + status filter,
// plus an "Add Candidate" dialog form. Mutations invalidate the list cache
// so the table refreshes automatically after create.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Search, Plus, ChevronLeft, ChevronRight, FileUp, Loader2, LayoutGrid, List,
  Globe, Link2, Users, MoreHorizontal, Briefcase, Clock, ExternalLink } from 'lucide-react'
import InitialsAvatar from '@/components/InitialsAvatar'
import { useNavigate } from 'react-router-dom'
import { useRef } from 'react'
import api from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/StatusBadge'
import {
  Dialog, DialogTrigger, DialogContent,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Skill { id: number; name: string }

interface Candidate {
  id: number
  first_name: string
  last_name: string
  email: string
  phone: string
  current_title: string
  current_company: string
  location: string
  status: string
  source: string
  skills: Skill[]
  created_at: string
  last_contacted_at: string | null
  active_submittals_count: number
  years_of_experience: number | null
}

interface PaginatedResponse {
  count: number
  next: string | null
  previous: string | null
  results: Candidate[]
}

// ── Zod schema for the add-candidate form ──────────────────────────────────────

const schema = z.object({
  first_name:      z.string().min(1, 'Required'),
  last_name:       z.string().min(1, 'Required'),
  email:           z.string().email('Invalid email'),
  phone:           z.string().min(1, 'Required'),
  current_title:   z.string().optional(),
  current_company: z.string().optional(),
  location:        z.string().optional(),
  status:          z.enum(['active', 'passive', 'placed', 'blacklisted']).default('active'),
  source:          z.enum(['referral', 'job_board', 'linkedin', 'direct', 'other']).default('other'),
  notes:              z.string().optional(),
  skill_names:        z.string().optional(),
  years_of_experience: z.coerce.number().int().min(0).max(60).optional().nullable(),
})

type FormValues = z.infer<typeof schema>

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtLastContacted(dt: string | null): string {
  if (!dt) return 'Never'
  const days = Math.floor((Date.now() - new Date(dt).getTime()) / 86_400_000)
  if (days === 0) return 'Today'
  return `${days}d ago`
}

// ── Add Candidate Form ─────────────────────────────────────────────────────────

interface DuplicateInfo {
  field: string
  id: number
  name: string
  status: string
}

function AddCandidateForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null)

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const create = useMutation({
    mutationFn: (payload: object) => api.post('/candidates/', payload).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['candidates'] })
      reset()
      setDuplicate(null)
      onSuccess()
    },
    onError: (err: any) => {
      const data = err?.response?.data
      if (err?.response?.status === 409 && data?.duplicate) {
        setDuplicate(data.duplicate)
      }
    },
  })

  async function handleParseResume(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParseError('')
    setParsing(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const { data } = await api.post('/attachments/parse/', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      if (data.first_name)    setValue('first_name', data.first_name)
      if (data.last_name)     setValue('last_name', data.last_name)
      if (data.email)         setValue('email', data.email)
      if (data.phone)         setValue('phone', data.phone)
      if (data.current_title) setValue('current_title', data.current_title)
    } catch {
      setParseError('Could not parse file. Fill in the fields manually.')
    } finally {
      setParsing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function onSubmit(values: FormValues) {
    const { skill_names, ...rest } = values
    await create.mutateAsync({
      ...rest,
      // Split comma-separated skills into an array, remove empty strings
      skill_names: skill_names
        ? skill_names.split(',').map(s => s.trim()).filter(Boolean)
        : [],
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">

      {/* Parse resume */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 flex items-center gap-3">
        <FileUp className="h-4 w-4 text-blue-500 shrink-0" />
        <span className="text-sm text-blue-700 flex-1">Auto-fill from CV</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={parsing}
          onClick={() => fileInputRef.current?.click()}
          className="shrink-0"
        >
          {parsing ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Upload CV'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          className="hidden"
          onChange={handleParseResume}
        />
      </div>
      {parseError && <p className="text-xs text-red-500">{parseError}</p>}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>First name *</Label>
          <Input {...register('first_name')} placeholder="Jane" />
          {errors.first_name && <p className="text-xs text-red-500">{errors.first_name.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Last name *</Label>
          <Input {...register('last_name')} placeholder="Doe" />
          {errors.last_name && <p className="text-xs text-red-500">{errors.last_name.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Email *</Label>
          <Input {...register('email')} type="email" placeholder="jane@example.com"
            onChange={e => { setDuplicate(null); register('email').onChange(e) }} />
          {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Phone *</Label>
          <Input {...register('phone')} placeholder="+44 7700 900000"
            onChange={e => { setDuplicate(null); register('phone').onChange(e) }} />
          {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Current title</Label>
          <Input {...register('current_title')} placeholder="Senior Engineer" />
        </div>
        <div className="space-y-1">
          <Label>Current company</Label>
          <Input {...register('current_company')} placeholder="Acme Corp" />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Location</Label>
        <Input {...register('location')} placeholder="London, UK" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Status</Label>
          <select {...register('status')} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
            <option value="active">Active</option>
            <option value="passive">Passive</option>
            <option value="placed">Placed</option>
            <option value="blacklisted">Blacklisted</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Source</Label>
          <select {...register('source')} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
            <option value="referral">Referral</option>
            <option value="job_board">Job Board</option>
            <option value="linkedin">LinkedIn</option>
            <option value="direct">Direct</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <Label>Years of experience</Label>
        <Input {...register('years_of_experience')} type="number" min={0} max={60} placeholder="e.g. 5" />
      </div>

      <div className="space-y-1">
        <Label>Skills <span className="text-gray-400 font-normal">(comma-separated)</span></Label>
        <Input {...register('skill_names')} placeholder="python, django, react" />
      </div>

      <div className="space-y-1">
        <Label>Notes</Label>
        <textarea
          {...register('notes')}
          rows={3}
          placeholder="Any notes about this candidate…"
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {duplicate && (
        <div className="bg-amber-50 border border-amber-300 rounded-md px-3 py-2.5 text-sm">
          <p className="font-medium text-amber-800">
            Duplicate {duplicate.field} — this candidate already exists:
          </p>
          <p className="text-amber-700 mt-1">
            <strong>{duplicate.name}</strong> · {duplicate.status}
          </p>
          <button
            type="button"
            className="text-blue-600 hover:underline text-xs mt-1"
            onClick={() => navigate(`/candidates/${duplicate.id}`)}
          >
            View existing profile &rarr;
          </button>
        </div>
      )}

      {create.isError && !duplicate && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          Failed to create candidate. Please check all fields.
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={isSubmitting || create.isPending}>
          {create.isPending ? 'Saving…' : 'Add Candidate'}
        </Button>
      </div>
    </form>
  )
}

// ── Card View Components ───────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="bg-[#1a1a2e] border border-white/[0.06] rounded-xl p-4 animate-pulse">
      <div className="flex justify-between mb-2">
        <div className="space-y-1.5 flex-1">
          <div className="h-4 bg-white/[0.08] rounded w-3/4" />
          <div className="h-3 bg-white/[0.05] rounded w-1/2" />
        </div>
        <div className="h-5 bg-white/[0.05] rounded w-14 ml-2" />
      </div>
      <div className="h-4 bg-white/[0.05] rounded w-1/4 mb-3" />
      <div className="flex gap-1 mb-4">
        {[12, 16, 10].map(w => (
          <div key={w} className={`h-5 bg-white/[0.05] rounded w-${w}`} />
        ))}
      </div>
      <div className="border-t border-white/[0.04] pt-3 flex justify-between">
        <div className="h-3 bg-white/[0.05] rounded w-24" />
        <div className="h-3 bg-white/[0.05] rounded w-16" />
      </div>
    </div>
  )
}

const STATUS_STYLES: Record<string, string> = {
  active:      'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25',
  passive:     'bg-amber-500/15 text-amber-300 border border-amber-500/25',
  placed:      'bg-blue-500/15 text-blue-300 border border-blue-500/25',
  blacklisted: 'bg-red-500/15 text-red-400 border border-red-500/25',
}

function SourceIcon({ source }: { source: string }) {
  const cls = 'h-3 w-3 shrink-0'
  switch (source) {
    case 'job_board': return <Globe className={cls} />
    case 'direct':    return <Link2 className={cls} />
    case 'referral':  return <Users className={cls} />
    case 'linkedin':  return <ExternalLink className={cls} />
    default:          return <MoreHorizontal className={cls} />
  }
}

function CandidateCard({ candidate }: { candidate: Candidate }) {
  const navigate = useNavigate()
  const statusClass = STATUS_STYLES[candidate.status] ?? STATUS_STYLES.active
  const visibleSkills = candidate.skills.slice(0, 3)
  const overflowCount = candidate.skills.length - 3

  return (
    <div
      onClick={() => navigate(`/candidates/${candidate.id}`, { state: { name: `${candidate.first_name} ${candidate.last_name}` } })}
      className="bg-[#1a1a2e] border border-white/[0.08] rounded-xl shadow-md p-4 cursor-pointer transition-all duration-200 hover:border-white/20 hover:scale-[1.01] hover:shadow-[0_8px_30px_rgba(139,92,246,0.12)] flex flex-col gap-3"
    >
      {/* Avatar + name + status badge */}
      <div className="flex items-start gap-3">
        <InitialsAvatar id={candidate.id} firstName={candidate.first_name} lastName={candidate.last_name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-100 text-base truncate">
            {candidate.first_name} {candidate.last_name}
          </p>
          <p className="text-sm text-slate-400 truncate">
            {candidate.current_title || '—'}
            {candidate.years_of_experience != null && (
              <span className="ml-1 text-slate-500">· {candidate.years_of_experience} yrs</span>
            )}
          </p>
        </div>
        <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${statusClass}`}>
          {candidate.status}
        </span>
      </div>

      {/* Source pill + skill tags */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="inline-flex items-center gap-1 bg-white/5 text-slate-400 border border-white/[0.08] rounded-full px-2 py-0.5 text-[11px] capitalize">
          <SourceIcon source={candidate.source} />
          {candidate.source.replace('_', ' ')}
        </span>
        {visibleSkills.map(s => (
          <span key={s.id} className="bg-slate-800 text-slate-300 border border-white/[0.08] rounded-md px-2 py-0.5 text-xs font-medium">
            {s.name}
          </span>
        ))}
        {overflowCount > 0 && (
          <span className="text-xs text-slate-500 px-1">+{overflowCount}</span>
        )}
        {candidate.skills.length === 0 && (
          <span className="text-xs text-slate-600 italic">No skills</span>
        )}
      </div>

      {/* Divider + footer stats */}
      <div className="border-t border-white/5 pt-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <Briefcase className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {candidate.active_submittals_count} submittal{candidate.active_submittals_count !== 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1 text-xs text-slate-500">
          <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
          {candidate.last_contacted_at
            ? `Last: ${fmtLastContacted(candidate.last_contacted_at)}`
            : 'Never'}
        </span>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Candidates() {
  const [viewMode,          setViewMode]          = useState<'table' | 'card'>(
    () => (localStorage.getItem('candidates_view_mode') as 'table' | 'card') ?? 'table'
  )
  const [search,            setSearch]            = useState('')
  const [status,            setStatus]            = useState('')
  const [notContactedOnly,  setNotContactedOnly]  = useState(false)
  const [page,              setPage]              = useState(1)
  const [dialogOpen,        setDialogOpen]        = useState(false)
  const [selected,          setSelected]          = useState<Set<number>>(new Set())
  const [bulkStatus,        setBulkStatus]        = useState('passive')

  function toggleViewMode() {
    const next = viewMode === 'table' ? 'card' : 'table'
    setViewMode(next)
    localStorage.setItem('candidates_view_mode', next)
  }
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ['candidates', search, status, notContactedOnly, page],
    queryFn:  () => api.get('/candidates/', {
      params: {
        search:               search || undefined,
        status:               status || undefined,
        not_contacted_days:   notContactedOnly ? 30 : undefined,
        page,
      },
    }).then(r => r.data),
    // Keep previous page data visible while next page loads
    placeholderData: prev => prev,
  })

  const totalPages = data ? Math.ceil(data.count / 10) : 1

  const pageIds = data?.results.map(c => c.id) ?? []
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selected.has(id))

  function toggleAll() {
    if (allPageSelected) {
      setSelected(prev => { const s = new Set(prev); pageIds.forEach(id => s.delete(id)); return s })
    } else {
      setSelected(prev => new Set([...prev, ...pageIds]))
    }
  }

  function toggleOne(id: number) {
    setSelected(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  const applyBulk = useMutation({
    mutationFn: () => api.patch('/candidates/bulk-status/', {
      ids: [...selected],
      status: bulkStatus,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['candidates'] })
      setSelected(new Set())
    },
  })

  return (
    <div className="space-y-4">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">Manage your candidate pipeline</p>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleViewMode}
            title={viewMode === 'table' ? 'Switch to card view' : 'Switch to table view'}
            className="p-2 rounded-md border border-input text-slate-400 hover:bg-white/[0.03] transition-colors"
          >
            {viewMode === 'table'
              ? <LayoutGrid className="h-4 w-4" />
              : <List className="h-4 w-4" />
            }
          </button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Add Candidate
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Candidate</DialogTitle>
              </DialogHeader>
              <AddCandidateForm onSuccess={() => setDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <Input
            className="pl-8"
            placeholder="Search name, email, title…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>

        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="h-9 rounded-lg border border-white/[0.12] bg-[#1a1a2e] px-3 text-sm hover:border-white/[0.25] hover:bg-[#1e1e36] transition-colors"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="passive">Passive</option>
          <option value="placed">Placed</option>
          <option value="blacklisted">Blacklisted</option>
        </select>

        <button
          onClick={() => { setNotContactedOnly(v => !v); setPage(1) }}
          className={`h-9 px-3 rounded-md border text-sm transition-colors ${
            notContactedOnly
              ? 'border-orange-400 bg-orange-50 text-orange-700 font-medium'
              : 'border-input bg-transparent text-slate-400 hover:bg-white/[0.03]'
          }`}
        >
          Not contacted in 30d
        </button>
      </div>

      {/* ── Card view ── */}
      {viewMode === 'card' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading && Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
          {!isLoading && data?.results.length === 0 && (
            <p className="col-span-3 py-12 text-center text-slate-500">No candidates found</p>
          )}
          {data?.results.map(c => <CandidateCard key={c.id} candidate={c} />)}
        </div>
      )}

      {/* ── Table view ── */}
      {viewMode === 'table' && (
        <div className="bg-[#1a1a2e] rounded-xl border border-white/[0.06] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.04] border-b border-white/[0.06]">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleAll}
                    className="rounded border-white/[0.2]"
                  />
                </th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Name</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Title / Company</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Contact</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Skills</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Last contacted</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">Loading…</td>
                </tr>
              )}
              {!isLoading && data?.results.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">No candidates found</td>
                </tr>
              )}
              {data?.results.map(c => (
                <tr key={c.id} className="hover:bg-white/[0.03] transition-colors cursor-pointer"
                  onClick={() => navigate(`/candidates/${c.id}`, { state: { name: `${c.first_name} ${c.last_name}` } })}>
                  <td className="px-4 py-3 w-10" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggleOne(c.id)}
                      className="rounded border-white/[0.2]"
                    />
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-100">
                    {c.first_name} {c.last_name}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {c.current_title || '—'}
                    {c.current_company && <span className="text-slate-500"> · {c.current_company}</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    <div>{c.email}</div>
                    <div className="text-slate-500">{c.phone}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.skills.slice(0, 3).map(s => (
                        <Badge key={s.id} variant="secondary">{s.name}</Badge>
                      ))}
                      {c.skills.length > 3 && (
                        <Badge variant="secondary">+{c.skills.length - 3}</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                    {fmtLastContacted(c.last_contacted_at)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ── */}
      {data && data.count > 10 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>{data.count} candidates · page {page} of {totalPages}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={!data.previous}
              onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={!data.next}
              onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Bulk action bar ── */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-xl">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <span className="text-gray-500">·</span>
          <select
            value={bulkStatus}
            onChange={e => setBulkStatus(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-sm text-white"
          >
            <option value="active">Active</option>
            <option value="passive">Passive</option>
            <option value="placed">Placed</option>
            <option value="blacklisted">Blacklisted</option>
          </select>
          <Button
            size="sm"
            disabled={applyBulk.isPending}
            onClick={() => applyBulk.mutate()}
          >
            {applyBulk.isPending ? 'Applying…' : 'Apply'}
          </Button>
          <button
            className="text-gray-400 hover:text-white text-sm"
            onClick={() => setSelected(new Set())}
          >
            Deselect all
          </button>
        </div>
      )}

    </div>
  )
}
