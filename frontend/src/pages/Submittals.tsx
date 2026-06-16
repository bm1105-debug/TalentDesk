// What this file does: paginated submittal list with status filter, an Add Submittal
// dialog, and per-row "Advance Stage" and "Add Note" actions. Advancing fetches the
// job's pipeline stages on demand so the user can pick the next stage.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, ChevronLeft, ChevronRight, ArrowRight, StickyNote, HandCoins } from 'lucide-react'
import api from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Submittal {
  id: number
  candidate: number
  candidate_name: string
  job: number
  job_title: string
  current_stage: number | null
  current_stage_name: string | null
  status: string
  cover_note: string
  submitted_by: string
  created_at: string
  updated_at: string
}

interface PaginatedSubmittals {
  count: number
  next: string | null
  previous: string | null
  results: Submittal[]
}

interface PipelineStage { id: number; name: string; order: number }
interface CandidateOption { id: number; first_name: string; last_name: string }
interface JobOption { id: number; title: string; client_name: string }

// ── Badge helpers ──────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, 'success' | 'default' | 'secondary' | 'destructive' | 'warning'> = {
  active:    'success',
  placed:    'default',
  rejected:  'destructive',
  withdrawn: 'secondary',
}

// ── Add Submittal Form ─────────────────────────────────────────────────────────

const addSchema = z.object({
  candidate:  z.coerce.number().min(1, 'Select a candidate'),
  job:        z.coerce.number().min(1, 'Select a job'),
  cover_note: z.string().optional(),
})
type AddFormValues = z.infer<typeof addSchema>

function AddSubmittalForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient()

  const { data: candidates = [] } = useQuery<CandidateOption[]>({
    queryKey: ['candidates-simple'],
    queryFn:  () => api.get('/candidates/', { params: { page_size: 200 } })
                       .then(r => r.data.results),
  })

  const { data: jobs = [] } = useQuery<JobOption[]>({
    queryKey: ['jobs-open'],
    queryFn:  () => api.get('/jobs/', { params: { status: 'open', page_size: 200 } })
                       .then(r => r.data.results),
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<AddFormValues>({
    resolver: zodResolver(addSchema),
  })

  const create = useMutation({
    mutationFn: (payload: object) => api.post('/submittals/', payload).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['submittals'] }); reset(); onSuccess() },
  })

  return (
    <form onSubmit={handleSubmit(v => create.mutateAsync(v))} className="space-y-3">

      <div className="space-y-1">
        <Label>Candidate *</Label>
        <select {...register('candidate')}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
          <option value="">— select candidate —</option>
          {candidates.map(c => (
            <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
          ))}
        </select>
        {errors.candidate && <p className="text-xs text-red-500">{errors.candidate.message}</p>}
      </div>

      <div className="space-y-1">
        <Label>Job *</Label>
        <select {...register('job')}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
          <option value="">— select open job —</option>
          {jobs.map(j => (
            <option key={j.id} value={j.id}>{j.title} · {j.client_name}</option>
          ))}
        </select>
        {errors.job && <p className="text-xs text-red-500">{errors.job.message}</p>}
      </div>

      <div className="space-y-1">
        <Label>Cover note</Label>
        <textarea {...register('cover_note')} rows={3}
          placeholder="Why this candidate is a good fit…"
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
      </div>

      {create.isError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          Failed. This candidate may already be submitted to that job.
        </p>
      )}

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Submit Candidate'}
        </Button>
      </div>
    </form>
  )
}

// ── Advance Stage Dialog ───────────────────────────────────────────────────────

function AdvanceStageDialog({ submittal, onDone }: { submittal: Submittal; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [stageId, setStageId] = useState<number | ''>('')
  const [notes, setNotes] = useState('')
  const qc = useQueryClient()

  // Fetch the job's pipeline stages only when the dialog opens
  const { data: stages = [] } = useQuery<PipelineStage[]>({
    queryKey: ['job-stages', submittal.job],
    queryFn:  () => api.get(`/jobs/${submittal.job}/`).then(r => r.data.stages),
    enabled:  open,
  })

  const advance = useMutation({
    mutationFn: () => api.post(`/submittals/${submittal.id}/advance/`, { stage_id: stageId, notes }),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['submittals'] })
      setOpen(false); setStageId(''); setNotes(''); onDone()
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-blue-600 hover:text-blue-700">
          <ArrowRight className="h-3.5 w-3.5" /> Advance
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Advance Stage</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            {submittal.candidate_name} → <span className="font-medium">{submittal.job_title}</span>
          </p>
          <p className="text-xs text-gray-400">
            Current: {submittal.current_stage_name ?? 'Not started'}
          </p>

          <div className="space-y-1">
            <Label>Move to stage</Label>
            <select value={stageId} onChange={e => setStageId(Number(e.target.value))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
              <option value="">— pick stage —</option>
              {stages.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label>Notes <span className="text-gray-400 font-normal">(optional)</span></Label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Passed phone screen, strong communication…"
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>

          {advance.isError && (
            <p className="text-xs text-red-500">Failed to advance. Check stage selection.</p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={!stageId || advance.isPending}
              onClick={() => advance.mutate()}>
              {advance.isPending ? 'Saving…' : 'Confirm'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Make Offer Dialog ──────────────────────────────────────────────────────────

const offerSchema = z.object({
  salary:      z.coerce.number().positive('Salary must be a positive number'),
  currency:    z.string().min(3).max(3).default('USD'),
  offer_date:  z.string().min(1, 'Offer date is required'),
  expiry_date: z.string().optional(),
  start_date:  z.string().optional(),
  notes:       z.string().optional(),
})
type OfferFormValues = z.infer<typeof offerSchema>

function MakeOfferDialog({ submittal, onDone }: { submittal: Submittal; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()

  const { register, handleSubmit, reset, formState: { errors } } = useForm<OfferFormValues>({
    resolver: zodResolver(offerSchema),
    defaultValues: { currency: 'USD' },
  })

  const create = useMutation({
    mutationFn: (payload: OfferFormValues) =>
      api.post('/offers/', { ...payload, submittal: submittal.id }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['offers'] })
      qc.invalidateQueries({ queryKey: ['submittals'] })
      reset(); setOpen(false); onDone()
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-emerald-600 hover:text-emerald-700">
          <HandCoins className="h-3.5 w-3.5" /> Offer
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Make Offer</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(v => create.mutateAsync(v))} className="space-y-3">
          <p className="text-sm text-gray-500">
            {submittal.candidate_name} → <span className="font-medium">{submittal.job_title}</span>
          </p>

          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label>Salary *</Label>
              <input {...register('salary')} type="number" placeholder="75000"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" />
              {errors.salary && <p className="text-xs text-red-500">{errors.salary.message}</p>}
            </div>
            <div className="w-20 space-y-1">
              <Label>Currency</Label>
              <input {...register('currency')} placeholder="USD" maxLength={3}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm uppercase" />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Offer date *</Label>
            <input {...register('offer_date')} type="date"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" />
            {errors.offer_date && <p className="text-xs text-red-500">{errors.offer_date.message}</p>}
          </div>

          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label>Expiry date <span className="text-gray-400 font-normal">(optional)</span></Label>
              <input {...register('expiry_date')} type="date"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" />
            </div>
            <div className="flex-1 space-y-1">
              <Label>Start date <span className="text-gray-400 font-normal">(optional)</span></Label>
              <input {...register('start_date')} type="date"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm" />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Notes <span className="text-gray-400 font-normal">(optional)</span></Label>
            <textarea {...register('notes')} rows={2}
              placeholder="Equity, benefits, remote policy…"
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>

          {create.isError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              Failed. There may already be a pending offer for this submittal.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Create Offer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Add Note Dialog ────────────────────────────────────────────────────────────

function AddNoteDialog({ submittal, onDone }: { submittal: Submittal; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const qc = useQueryClient()

  const addNote = useMutation({
    mutationFn: () => api.post(`/submittals/${submittal.id}/add-note/`, { notes: note }),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['submittals'] })
      setOpen(false); setNote(''); onDone()
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-gray-500 hover:text-gray-700">
          <StickyNote className="h-3.5 w-3.5" /> Note
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Add Note</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            {submittal.candidate_name} · {submittal.job_title}
          </p>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={4}
            placeholder="Client feedback, interview outcome…"
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={!note.trim() || addNote.isPending}
              onClick={() => addNote.mutate()}>
              {addNote.isPending ? 'Saving…' : 'Save Note'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Submittals() {
  const { user } = useAuth()
  const isManager = user?.role !== 'recruiter'

  const [status,     setStatus]     = useState('')
  const [page,       setPage]       = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data, isLoading } = useQuery<PaginatedSubmittals>({
    queryKey: ['submittals', status, page],
    queryFn:  () => api.get('/submittals/', {
      params: { status: status || undefined, page },
    }).then(r => r.data),
    placeholderData: prev => prev,
  })

  const totalPages = data ? Math.ceil(data.count / 10) : 1

  return (
    <div className="space-y-4">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Submittals</h1>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> Submit Candidate
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Submit Candidate to Job</DialogTitle></DialogHeader>
            <AddSubmittalForm onSuccess={() => setDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Status filter ── */}
      <div className="flex items-center gap-3">
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="placed">Placed</option>
          <option value="rejected">Rejected</option>
          <option value="withdrawn">Withdrawn</option>
        </select>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Candidate</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Job</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Stage</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Submitted by</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            )}
            {!isLoading && data?.results.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No submittals found</td></tr>
            )}
            {data?.results.map(s => (
              <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">{s.candidate_name}</td>
                <td className="px-4 py-3 text-gray-600">{s.job_title}</td>
                <td className="px-4 py-3 text-gray-600">
                  {s.current_stage_name
                    ? <span className="text-blue-700 font-medium">{s.current_stage_name}</span>
                    : <span className="text-gray-400">Not started</span>
                  }
                </td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[s.status] ?? 'secondary'}>{s.status}</Badge>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{s.submitted_by}</td>
                <td className="px-4 py-3">
                  {/* Only show actions for active submittals */}
                  {s.status === 'active' && (
                    <div className="flex items-center gap-1">
                      <AdvanceStageDialog submittal={s} onDone={() => {}} />
                      <AddNoteDialog submittal={s} onDone={() => {}} />
                      <MakeOfferDialog submittal={s} onDone={() => {}} />
                    </div>
                  )}
                  {/* Managers can change status on non-active submittals too */}
                  {isManager && s.status !== 'active' && (
                    <span className="text-xs text-gray-400">Closed</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {data && data.count > 10 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>{data.count} submittals · page {page} of {totalPages}</span>
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
