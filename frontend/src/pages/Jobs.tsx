// What this file does: paginated job list with search + status + priority filters,
// plus an "Add Job" dialog. Job creation requires a client FK so the form fetches
// the client list first. Recruiters see the list but only managers can create.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Search, Plus, ChevronLeft, ChevronRight, Users } from 'lucide-react'
import api from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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

const STATUS_VARIANT: Record<string, 'success' | 'default' | 'secondary' | 'destructive' | 'warning'> = {
  open:      'success',
  draft:     'secondary',
  on_hold:   'warning',
  filled:    'default',
  cancelled: 'destructive',
}

const PRIORITY_VARIANT: Record<string, 'destructive' | 'warning' | 'default' | 'secondary'> = {
  urgent: 'destructive',
  high:   'warning',
  medium: 'default',
  low:    'secondary',
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
        <select {...register('client')} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
          <option value="">— select client —</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {errors.client && <p className="text-xs text-red-500">{errors.client.message}</p>}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>Type</Label>
          <select {...register('job_type')} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
            <option value="full_time">Full Time</option>
            <option value="part_time">Part Time</option>
            <option value="contract">Contract</option>
            <option value="temp">Temporary</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Status</Label>
          <select {...register('status')} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
            <option value="draft">Draft</option>
            <option value="open">Open</option>
            <option value="on_hold">On Hold</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Priority</Label>
          <select {...register('priority')} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
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
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
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
  const isManager = user?.role !== 'recruiter'

  const [search,     setSearch]     = useState('')
  const [status,     setStatus]     = useState('')
  const [priority,   setPriority]   = useState('')
  const [page,       setPage]       = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data, isLoading } = useQuery<PaginatedJobs>({
    queryKey: ['jobs', search, status, priority, page],
    queryFn:  () => api.get('/jobs/', {
      params: {
        search:   search   || undefined,
        status:   status   || undefined,
        priority: priority || undefined,
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
        <h1 className="text-xl font-semibold text-gray-900">Jobs</h1>

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
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input className="pl-8" placeholder="Search title, client, location…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>

        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm">
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="open">Open</option>
          <option value="on_hold">On Hold</option>
          <option value="filled">Filled</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select value={priority} onChange={e => { setPriority(e.target.value); setPage(1) }}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm">
          <option value="">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Title</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Priority</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Openings</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Target</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Assigned</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            )}
            {!isLoading && data?.results.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No jobs found</td></tr>
            )}
            {data?.results.map(j => (
              <tr key={j.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {j.title}
                  {j.location && <span className="block text-xs text-gray-400 font-normal">{j.location}</span>}
                </td>
                <td className="px-4 py-3 text-gray-600">{j.client_name}</td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[j.status] ?? 'secondary'}>
                    {j.status.replace('_', ' ')}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={PRIORITY_VARIANT[j.priority] ?? 'secondary'}>{j.priority}</Badge>
                </td>
                <td className="px-4 py-3 text-gray-600">{j.openings}</td>
                <td className="px-4 py-3 text-gray-600">
                  {j.target_date
                    ? new Date(j.target_date).toLocaleDateString()
                    : <span className="text-gray-400">—</span>
                  }
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {j.assigned_to_names.length > 0
                    ? (
                      <div className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-gray-400" />
                        <span className="text-xs">{j.assigned_to_names.slice(0, 2).join(', ')}
                          {j.assigned_to_names.length > 2 && ` +${j.assigned_to_names.length - 2}`}
                        </span>
                      </div>
                    )
                    : <span className="text-gray-400 text-xs">Unassigned</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {data && data.count > 10 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
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
