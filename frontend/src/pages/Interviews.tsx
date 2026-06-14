// What this file does: interview list with schedule dialog and inline status updates.
// Fetches active submittals for the schedule form so only valid submittal+candidate
// combinations can be booked.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, ChevronLeft, ChevronRight, CheckCircle, XCircle } from 'lucide-react'
import api from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Interview {
  id: number
  submittal: number
  candidate_name: string
  job_title: string
  interview_type: string
  status: string
  scheduled_at: string
  duration_minutes: number | null
  meeting_link: string
  location: string
  notes: string
}

interface PaginatedInterviews {
  count: number; next: string | null; previous: string | null; results: Interview[]
}

interface SubmittalOption {
  id: number; candidate_name: string; job_title: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'secondary' | 'destructive' | 'warning'> = {
  scheduled:  'default',
  completed:  'success',
  cancelled:  'secondary',
  no_show:    'destructive',
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  })
}

// ── Schedule Form ──────────────────────────────────────────────────────────────

const scheduleSchema = z.object({
  submittal:        z.coerce.number().min(1, 'Select a submittal'),
  interview_type:   z.enum(['phone', 'video', 'in_person', 'technical']),
  scheduled_at:     z.string().min(1, 'Required'),
  duration_minutes: z.coerce.number().min(1).optional(),
  meeting_link:     z.string().optional(),
  location:         z.string().optional(),
})
type ScheduleValues = z.infer<typeof scheduleSchema>

function ScheduleForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient()

  const { data: submittals = [] } = useQuery<SubmittalOption[]>({
    queryKey: ['submittals-active'],
    queryFn:  () => api.get('/submittals/', { params: { status: 'active', page_size: 200 } })
                       .then(r => r.data.results),
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ScheduleValues>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: { interview_type: 'video' },
  })

  const create = useMutation({
    mutationFn: (payload: object) => api.post('/interviews/', payload).then(r => r.data),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['interviews'] }); reset(); onSuccess() },
  })

  return (
    <form onSubmit={handleSubmit(v => create.mutateAsync(v))} className="space-y-3">

      <div className="space-y-1">
        <Label>Submittal *</Label>
        <select {...register('submittal')}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
          <option value="">— select active submittal —</option>
          {submittals.map(s => (
            <option key={s.id} value={s.id}>{s.candidate_name} → {s.job_title}</option>
          ))}
        </select>
        {errors.submittal && <p className="text-xs text-red-500">{errors.submittal.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Type</Label>
          <select {...register('interview_type')}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
            <option value="phone">Phone</option>
            <option value="video">Video</option>
            <option value="in_person">In Person</option>
            <option value="technical">Technical</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Duration (mins)</Label>
          <Input {...register('duration_minutes')} type="number" min={1} placeholder="45" />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Scheduled at *</Label>
        <Input {...register('scheduled_at')} type="datetime-local" />
        {errors.scheduled_at && <p className="text-xs text-red-500">{errors.scheduled_at.message}</p>}
      </div>

      <div className="space-y-1">
        <Label>Meeting link</Label>
        <Input {...register('meeting_link')} placeholder="https://meet.google.com/…" />
      </div>

      <div className="space-y-1">
        <Label>Location</Label>
        <Input {...register('location')} placeholder="Office address or 'Remote'" />
      </div>

      {create.isError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          Failed. Check the date is in the future and the submittal is active.
        </p>
      )}

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Schedule Interview'}
        </Button>
      </div>
    </form>
  )
}

// ── Status Update inline ───────────────────────────────────────────────────────

function StatusButtons({ interview }: { interview: Interview }) {
  const qc = useQueryClient()
  if (interview.status !== 'scheduled') return null

  const update = useMutation({
    mutationFn: (s: string) =>
      api.post(`/interviews/${interview.id}/update-status/`, { status: s }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['interviews'] }),
  })

  return (
    <div className="flex items-center gap-1">
      <button onClick={() => update.mutate('completed')} disabled={update.isPending}
        title="Mark completed"
        className="p-1 rounded text-green-600 hover:bg-green-50 transition-colors">
        <CheckCircle className="h-4 w-4" />
      </button>
      <button onClick={() => update.mutate('cancelled')} disabled={update.isPending}
        title="Cancel"
        className="p-1 rounded text-gray-400 hover:bg-gray-100 transition-colors">
        <XCircle className="h-4 w-4" />
      </button>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Interviews() {
  const [statusFilter, setStatusFilter] = useState('')
  const [page,         setPage]         = useState(1)
  const [dialogOpen,   setDialogOpen]   = useState(false)

  const { data, isLoading } = useQuery<PaginatedInterviews>({
    queryKey: ['interviews', statusFilter, page],
    queryFn:  () => api.get('/interviews/', {
      params: { status: statusFilter || undefined, page },
    }).then(r => r.data),
    placeholderData: prev => prev,
  })

  const totalPages = data ? Math.ceil(data.count / 10) : 1

  return (
    <div className="space-y-4">

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Interviews</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> Schedule Interview
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Schedule Interview</DialogTitle></DialogHeader>
            <ScheduleForm onSuccess={() => setDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-3">
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm">
          <option value="">All statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="no_show">No Show</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Candidate</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Job</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Scheduled</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>}
            {!isLoading && data?.results.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No interviews found</td></tr>
            )}
            {data?.results.map(i => (
              <tr key={i.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">{i.candidate_name}</td>
                <td className="px-4 py-3 text-gray-600">{i.job_title}</td>
                <td className="px-4 py-3 text-gray-600 capitalize">{i.interview_type.replace('_', ' ')}</td>
                <td className="px-4 py-3 text-gray-600">{fmtDateTime(i.scheduled_at)}</td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[i.status] ?? 'secondary'}>
                    {i.status.replace('_', ' ')}
                  </Badge>
                </td>
                <td className="px-4 py-3"><StatusButtons interview={i} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.count > 10 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>{data.count} interviews · page {page} of {totalPages}</span>
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
