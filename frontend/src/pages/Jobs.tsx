// What this file does: paginated job list with search + status + priority filters,
// plus an "Add Job" dialog. Job creation requires a client FK so the form fetches
// the client list first. Recruiters see the list but only managers can create.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Search, Plus, ChevronLeft, ChevronRight, Users, ChevronUp, ChevronDown } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Job {
  id: number
  title: string
  client: number
  client_name: string
  status: string
  priority: string
  job_type: string
  openings: number
  location: string
  target_date: string | null
  assigned_to_names: string[]
  created_at: string
}

interface Client { id: number; name: string }

interface PaginatedJobs {
  count: number
  next: string | null
  previous: string | null
  results: Job[]
}

// ── Schema ─────────────────────────────────────────────────────────────────────

const schema = z.object({
  title:       z.string().min(1, 'Required'),
  client:      z.coerce.number({ invalid_type_error: 'Select a client' }).min(1, 'Required'),
  job_type:    z.enum(['full_time', 'part_time', 'contract', 'temp']).default('full_time'),
  status:      z.enum(['draft', 'open', 'on_hold', 'filled', 'cancelled']).default('draft'),
  priority:    z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  openings:    z.coerce.number().min(1).default(1),
  location:    z.string().optional(),
  target_date: z.string().optional(),
  description: z.string().optional(),
  requirements:z.string().optional(),
})

type FormValues = z.infer<typeof schema>

// ── Badge helpers ──────────────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<string, string> = {
  urgent: 'bg-red-500/15 text-red-400 border border-red-500/25',
  high:   'bg-orange-500/15 text-orange-400 border border-orange-500/25',
  medium: 'bg-amber-500/15 text-amber-400 border border-amber-500/25',
  low:    'bg-slate-500/15 text-slate-400 border border-slate-500/25',
}
function PriorityBadge({ priority }: { priority: string }) {
  const cls = PRIORITY_STYLES[priority] ?? 'bg-slate-500/15 text-slate-400 border border-slate-500/25'
  return <span className={`priority-badge ${cls}`}>{priority}</span>
}

const JOB_STATUS_STYLES: Record<string, string> = {
  open:      'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
  on_hold:   'bg-amber-500/15 text-amber-400 border border-amber-500/25',
  filled:    'bg-blue-500/15 text-blue-400 border border-blue-500/25',
  draft:     'bg-slate-500/15 text-slate-400 border border-slate-500/25',
  cancelled: 'bg-slate-500/10 text-slate-500 border border-slate-500/20',
}
function JobStatusBadge({ status }: { status: string }) {
  const cls = JOB_STATUS_STYLES[status] ?? 'bg-slate-500/15 text-slate-400 border border-slate-500/25'
  return <span className={`priority-badge ${cls}`}>{status.replace('_', ' ')}</span>
}

function daysOpen(createdAt: string) {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000)
}

function DaysOpenCell({ job }: { job: Job }) {
  if (!['open', 'on_hold'].includes(job.status))
    return <span className="text-slate-600 text-xs">—</span>
  const days = daysOpen(job.created_at)
  const cls =
    days >= 60 ? 'text-red-400 font-semibold' :
    days >= 30 ? 'text-amber-400 font-medium' :
                 'text-slate-400'
  return <span className={`text-xs tabular-nums ${cls}`}>{days}d</span>
}

function SortTh({ label, col, sortCol, sortDir, onSort }: {
  label: string; col: string; sortCol: string | null; sortDir: 'asc' | 'desc'
  onSort: (col: string) => void
}) {
  const active = sortCol === col
  return (
    <th onClick={() => onSort(col)}
      className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none">
      <div className="flex items-center gap-1">
        {label}
        {active
          ? (sortDir === 'asc' ? <ChevronUp className="h-3 w-3 text-violet-400" /> : <ChevronDown className="h-3 w-3 text-violet-400" />)
          : <ChevronDown className="h-3 w-3 text-slate-700" />
        }
      </div>
    </th>
  )
}

// ── Add Job Form ───────────────────────────────────────────────────────────────

function AddJobForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient()

  // Fetch client list for the dropdown
  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['clients-simple'],
    queryFn:  () => api.get('/clients/', { params: { page_size: 200 } }).then(r =>
      // handle both paginated {results:[]} and flat array
      Array.isArray(r.data) ? r.data : r.data.results
    ),
  })

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const create = useMutation({
    mutationFn: (payload: object) => api.post('/jobs/', payload).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] })
      reset()
      onSuccess()
    },
  })

  return (
    <form onSubmit={handleSubmit(v => create.mutateAsync(v))} className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">

      <div className="space-y-1">
        <Label>Job title *</Label>
        <Input {...register('title')} placeholder="Senior Backend Engineer" />
        {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
      </div>

      <div className="space-y-1">
        <Label>Client *</Label>
        <select {...register('client')} className="flex h-9 w-full rounded-md border border-white/[0.12] bg-[#1a1a2e] text-slate-200 px-3 py-1 text-sm shadow-sm">
          <option value="">— select client —</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {errors.client && <p className="text-xs text-red-500">{errors.client.message}</p>}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>Type</Label>
          <select {...register('job_type')} className="flex h-9 w-full rounded-md border border-white/[0.12] bg-[#1a1a2e] text-slate-200 px-3 py-1 text-sm shadow-sm">
            <option value="full_time">Full Time</option>
            <option value="part_time">Part Time</option>
            <option value="contract">Contract</option>
            <option value="temp">Temporary</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Status</Label>
          <select {...register('status')} className="flex h-9 w-full rounded-md border border-white/[0.12] bg-[#1a1a2e] text-slate-200 px-3 py-1 text-sm shadow-sm">
            <option value="draft">Draft</option>
            <option value="open">Open</option>
            <option value="on_hold">On Hold</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Priority</Label>
          <select {...register('priority')} className="flex h-9 w-full rounded-md border border-white/[0.12] bg-[#1a1a2e] text-slate-200 px-3 py-1 text-sm shadow-sm">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Openings</Label>
          <Input {...register('openings')} type="number" min={1} defaultValue={1} />
        </div>
        <div className="space-y-1">
          <Label>Target date</Label>
          <Input {...register('target_date')} type="date" />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Location</Label>
        <Input {...register('location')} placeholder="London / Remote" />
      </div>

      <div className="space-y-1">
        <Label>Description</Label>
        <textarea {...register('description')} rows={2}
          placeholder="Internal job description…"
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
      </div>

      <div className="space-y-1">
        <Label>Requirements</Label>
        <textarea {...register('requirements')} rows={2}
          placeholder="Skills and experience required…"
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
      </div>

      {create.isError && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
          Failed to create job. You may not have permission.
        </p>
      )}

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={isSubmitting || create.isPending}>
          {create.isPending ? 'Saving…' : 'Add Job'}
        </Button>
      </div>
    </form>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Jobs() {
  const { user } = useAuth()
  const isManager = ['vp', 'ceo'].includes(user?.role ?? '')

  const [searchParams] = useSearchParams()
  const [search,     setSearch]     = useState('')
  const [status,     setStatus]     = useState('')
  const [priority,   setPriority]   = useState(searchParams.get('priority') ?? '')
  const [overdue]                    = useState(searchParams.get('filter') === 'overdue')
  const [page,       setPage]       = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [sortCol,    setSortCol]    = useState<string | null>(null)
  const [sortDir,    setSortDir]    = useState<'asc' | 'desc'>('asc')

  function handleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const { data, isLoading } = useQuery<PaginatedJobs>({
    queryKey: ['jobs', search, status, priority, overdue, page],
    queryFn:  () => api.get('/jobs/', {
      params: {
        search:   search   || undefined,
        status:   status   || undefined,
        priority: priority || undefined,
        overdue:  overdue  ? 'true' : undefined,
        page,
      },
    }).then(r => r.data),
    placeholderData: prev => prev,
  })

  const totalPages = data ? Math.ceil(data.count / 10) : 1

  return (
    <div className="space-y-4">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">Track open positions and hiring progress</p>

        {/* Only show Add button for managers — recruiters are read-only */}
        {isManager && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Add Job
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader><DialogTitle>Add Job</DialogTitle></DialogHeader>
              <AddJobForm onSuccess={() => setDialogOpen(false)} />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* ── Filters ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <Input className="pl-8" placeholder="Search title, client, location…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>

        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="h-9 rounded-lg border border-white/[0.12] bg-[#1a1a2e] px-3 text-sm hover:border-white/[0.25] hover:bg-[#1e1e36] transition-colors">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="open">Open</option>
          <option value="on_hold">On Hold</option>
          <option value="filled">Filled</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select value={priority} onChange={e => { setPriority(e.target.value); setPage(1) }}
          className="h-9 rounded-lg border border-white/[0.12] bg-[#1a1a2e] px-3 text-sm hover:border-white/[0.25] hover:bg-[#1e1e36] transition-colors">
          <option value="">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* ── Table ── */}
      <div className="bg-[#1a1a2e] rounded-xl border border-white/[0.08] overflow-x-auto shadow-sm"
        style={{ borderTop: '2px solid #3b82f6' }}>
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-[#12121f] border-b border-white/[0.08] sticky top-0 z-10">
            <tr>
              <SortTh label="Title"    col="title"    sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Client</th>
              <SortTh label="Status"   col="status"   sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortTh label="Priority" col="priority" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Openings</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Age</th>
              <SortTh label="Target"   col="target"   sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Assigned</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {isLoading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>
            )}
            {!isLoading && data?.results.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No jobs found</td></tr>
            )}
            {data?.results.map(j => (
              <tr key={j.id} className="hover:bg-white/[0.03] transition-colors duration-100">
                <td className="px-4 py-3 font-medium text-slate-100">
                  <Link to={`/jobs/${j.id}`} state={{ name: j.title }} className="hover:text-violet-400 hover:underline">
                    {j.title}
                  </Link>
                  {j.location && <span className="block text-xs text-slate-500 font-normal">{j.location}</span>}
                </td>
                <td className="px-4 py-3 text-slate-400">{j.client_name}</td>
                <td className="px-4 py-3"><JobStatusBadge status={j.status} /></td>
                <td className="px-4 py-3"><PriorityBadge priority={j.priority} /></td>
                <td className="px-4 py-3 text-slate-400">{j.openings}</td>
                <td className="px-4 py-3"><DaysOpenCell job={j} /></td>
                <td className="px-4 py-3 text-slate-400">
                  {j.target_date
                    ? new Date(j.target_date).toLocaleDateString()
                    : <span className="text-slate-500">—</span>
                  }
                </td>
                <td className="px-4 py-3 text-slate-400">
                  {j.assigned_to_names.length > 0
                    ? (
                      <div className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-slate-500" />
                        <span className="text-xs">{j.assigned_to_names.slice(0, 2).join(', ')}
                          {j.assigned_to_names.length > 2 && ` +${j.assigned_to_names.length - 2}`}
                        </span>
                      </div>
                    )
                    : <span className="text-slate-500 text-xs">Unassigned</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {data && data.count > 10 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
          <span>{data.count} jobs · page {page} of {totalPages}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={!data.previous} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={!data.next} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

    </div>
  )
}
