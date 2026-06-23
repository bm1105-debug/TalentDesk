// What this file does: paginated submittal list with status filter, an Add Submittal
// dialog, and per-row "Advance Stage" and "Add Note" actions. Advancing fetches the
// job's pipeline stages on demand so the user can pick the next stage.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, ChevronLeft, ChevronRight, ArrowRight, StickyNote, HandCoins, Star, XCircle, ChevronUp, ChevronDown } from 'lucide-react'
import api from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
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
  is_shortlisted: boolean
  match_score: number | null
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
          className="h-9 w-full rounded-md border border-white/[0.12] bg-[#1a1a2e] text-slate-200 px-3 py-1 text-sm">
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
          className="h-9 w-full rounded-md border border-white/[0.12] bg-[#1a1a2e] text-slate-200 px-3 py-1 text-sm">
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
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
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
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10">
          <ArrowRight className="h-3.5 w-3.5" /> Advance
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Advance Stage</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            {submittal.candidate_name} → <span className="font-medium text-slate-200">{submittal.job_title}</span>
          </p>
          <p className="text-xs text-slate-500">
            Current: {submittal.current_stage_name ?? 'Not started'}
          </p>

          <div className="space-y-1">
            <Label>Move to stage</Label>
            <select value={stageId} onChange={e => setStageId(Number(e.target.value))}
              className="h-9 w-full rounded-md border border-white/[0.12] bg-[#1a1a2e] text-slate-200 px-3 py-1 text-sm">
              <option value="">— pick stage —</option>
              {stages.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label>Notes <span className="text-slate-500 font-normal">(optional)</span></Label>
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
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10">
          <HandCoins className="h-3.5 w-3.5" /> Offer
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Make Offer</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(v => create.mutateAsync(v))} className="space-y-3">
          <p className="text-sm text-slate-400">
            {submittal.candidate_name} → <span className="font-medium text-slate-200">{submittal.job_title}</span>
          </p>

          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label>Salary *</Label>
              <input {...register('salary')} type="number" placeholder="75000"
                className="flex h-9 w-full rounded-md border border-white/[0.12] bg-[#12121f] text-slate-200 px-3 py-1 text-sm shadow-sm" />
              {errors.salary && <p className="text-xs text-red-500">{errors.salary.message}</p>}
            </div>
            <div className="w-20 space-y-1">
              <Label>Currency</Label>
              <input {...register('currency')} placeholder="USD" maxLength={3}
                className="flex h-9 w-full rounded-md border border-white/[0.12] bg-[#12121f] text-slate-200 px-3 py-1 text-sm shadow-sm uppercase" />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Offer date *</Label>
            <input {...register('offer_date')} type="date"
              className="flex h-9 w-full rounded-md border border-white/[0.12] bg-[#12121f] text-slate-200 px-3 py-1 text-sm shadow-sm" />
            {errors.offer_date && <p className="text-xs text-red-500">{errors.offer_date.message}</p>}
          </div>

          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label>Expiry date <span className="text-slate-500 font-normal">(optional)</span></Label>
              <input {...register('expiry_date')} type="date"
                className="flex h-9 w-full rounded-md border border-white/[0.12] bg-[#12121f] text-slate-200 px-3 py-1 text-sm shadow-sm" />
            </div>
            <div className="flex-1 space-y-1">
              <Label>Start date <span className="text-slate-500 font-normal">(optional)</span></Label>
              <input {...register('start_date')} type="date"
                className="flex h-9 w-full rounded-md border border-white/[0.12] bg-[#12121f] text-slate-200 px-3 py-1 text-sm shadow-sm" />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Notes <span className="text-slate-500 font-normal">(optional)</span></Label>
            <textarea {...register('notes')} rows={2}
              placeholder="Equity, benefits, remote policy…"
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>

          {create.isError && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
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
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-slate-400 hover:text-slate-300 hover:bg-white/[0.05]">
          <StickyNote className="h-3.5 w-3.5" /> Note
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Add Note</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
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

// ── Rejection Email Prompt ─────────────────────────────────────────────────────

interface RejectionHint {
  candidate_name:         string
  candidate_email:        string
  candidate:              number   // candidate ID
  rejection_template_id:  number
}

function RejectionEmailPrompt({ hint, onClose }: { hint: RejectionHint; onClose: () => void }) {
  const send = useMutation({
    mutationFn: () => api.post('/communications/send/', {
      template_id:       hint.rejection_template_id,
      to_email:          hint.candidate_email,
      to_name:           hint.candidate_name,
      related_candidate: hint.candidate,
      context:           { candidate_name: hint.candidate_name },
    }),
    onSettled: onClose,
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 pointer-events-none">
      <div className="pointer-events-auto bg-[#1a1a2e] border border-white/[0.06] rounded-xl shadow-2xl p-5 max-w-sm w-full mx-4">
        <p className="text-sm font-medium text-slate-100 mb-1">Send rejection email?</p>
        <p className="text-xs text-slate-500 mb-4">
          To: <span className="font-medium">{hint.candidate_name}</span> ({hint.candidate_email})
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={send.isPending}>
            Skip
          </Button>
          <Button size="sm" disabled={send.isPending} onClick={() => send.mutate()}>
            {send.isPending ? 'Sending…' : 'Send Email'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Change Status Dialog ───────────────────────────────────────────────────────

function ChangeStatusDialog({
  submittal,
  onDone,
}: {
  submittal: Submittal
  onDone: (hint?: RejectionHint) => void
}) {
  const [open,   setOpen]   = useState(false)
  const [value,  setValue]  = useState<'rejected' | 'withdrawn'>('rejected')
  const [notes,  setNotes]  = useState('')
  const qc = useQueryClient()

  const change = useMutation({
    mutationFn: () =>
      api.post(`/submittals/${submittal.id}/change-status/`, { status: value, notes }).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['submittals'] })
      setOpen(false)
      setNotes('')
      if (data.rejection_template_available) {
        onDone({
          candidate_name:        data.candidate_name,
          candidate_email:       data.candidate_email,
          candidate:             data.candidate,
          rejection_template_id: data.rejection_template_id,
        })
      } else {
        onDone()
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10">
          <XCircle className="h-3.5 w-3.5" /> Close
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Close Submittal</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            {submittal.candidate_name} · <span className="font-medium text-slate-200">{submittal.job_title}</span>
          </p>

          <div className="space-y-1">
            <Label>Reason</Label>
            <select value={value} onChange={e => setValue(e.target.value as 'rejected' | 'withdrawn')}
              className="h-9 w-full rounded-md border border-white/[0.12] bg-[#1a1a2e] text-slate-200 px-3 py-1 text-sm">
              <option value="rejected">Rejected by client</option>
              <option value="withdrawn">Candidate withdrew</option>
            </select>
          </div>

          <div className="space-y-1">
            <Label>Notes <span className="text-slate-500 font-normal">(optional)</span></Label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Reason for closing…"
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" variant="destructive" disabled={change.isPending}
              onClick={() => change.mutate()}>
              {change.isPending ? 'Saving…' : 'Confirm Close'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────

const SUBMITTAL_STATUS_STYLES: Record<string, string> = {
  active:    'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
  placed:    'bg-blue-500/15 text-blue-400 border border-blue-500/25',
  rejected:  'bg-red-500/15 text-red-400 border border-red-500/25',
  withdrawn: 'bg-slate-500/15 text-slate-400 border border-slate-500/25',
}
function SubmittalStatusBadge({ status }: { status: string }) {
  const cls = SUBMITTAL_STATUS_STYLES[status] ?? 'bg-slate-500/15 text-slate-400 border border-slate-500/25'
  return <span className={`priority-badge ${cls}`}>{status}</span>
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

// ── Match Score Badge ──────────────────────────────────────────────────────────

function MatchBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-slate-500 text-xs">—</span>
  const cls =
    score >= 70 ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' :
    score >= 40 ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25' :
                  'bg-red-500/15 text-red-400 border border-red-500/25'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {score}
    </span>
  )
}

// ── Star (Shortlist) Toggle ────────────────────────────────────────────────────

function StarButton({ submittal }: { submittal: Submittal }) {
  const qc = useQueryClient()

  const toggle = useMutation({
    mutationFn: () =>
      api.patch(`/submittals/${submittal.id}/`, { is_shortlisted: !submittal.is_shortlisted }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['submittals'] }),
  })

  return (
    <button
      onClick={() => toggle.mutate()}
      disabled={toggle.isPending}
      title={submittal.is_shortlisted ? 'Remove from shortlist' : 'Add to shortlist'}
      className="p-1 rounded hover:bg-amber-500/10 transition-colors disabled:opacity-40"
    >
      <Star
        className={`h-4 w-4 transition-colors ${
          submittal.is_shortlisted
            ? 'fill-amber-400 stroke-amber-400'
            : 'stroke-slate-500 hover:stroke-amber-400'
        }`}
      />
    </button>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Submittals() {
  const { user } = useAuth()
  const isManager = ['vp', 'ceo'].includes(user?.role ?? '')

  const [status,          setStatus]          = useState('')
  const [showShortlisted, setShowShortlisted] = useState(false)
  const [page,            setPage]            = useState(1)
  const [dialogOpen,      setDialogOpen]      = useState(false)
  const [rejectionHint,   setRejectionHint]   = useState<RejectionHint | null>(null)
  const [sortCol,         setSortCol]         = useState<string | null>(null)
  const [sortDir,         setSortDir]         = useState<'asc' | 'desc'>('asc')

  function handleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const { data, isLoading } = useQuery<PaginatedSubmittals>({
    queryKey: ['submittals', status, showShortlisted, page],
    queryFn:  () => api.get('/submittals/', {
      params: {
        status:      status || undefined,
        shortlisted: showShortlisted ? 'true' : undefined,
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

      {/* ── Filters ── */}
      <div className="flex items-center gap-3">
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="h-9 rounded-lg border border-white/[0.12] bg-[#1a1a2e] px-3 text-sm hover:border-white/[0.25] hover:bg-[#1e1e36] transition-colors">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="placed">Placed</option>
          <option value="rejected">Rejected</option>
          <option value="withdrawn">Withdrawn</option>
        </select>

        <button
          onClick={() => { setShowShortlisted(v => !v); setPage(1) }}
          className={`flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm transition-colors ${
            showShortlisted
              ? 'border-amber-400/50 bg-amber-500/15 text-amber-400 font-medium'
              : 'border-white/[0.12] bg-[#1a1a2e] text-slate-400 hover:bg-white/[0.03]'
          }`}
        >
          <Star className={`h-3.5 w-3.5 ${showShortlisted ? 'fill-amber-400 stroke-amber-400' : 'stroke-gray-400'}`} />
          Shortlisted
        </button>
      </div>

      {/* ── Table ── */}
      <div className="bg-[#1a1a2e] rounded-xl border border-white/[0.08] overflow-hidden shadow-sm"
        style={{ borderTop: '2px solid #8b5cf6' }}>
        <table className="w-full text-sm">
          <thead className="bg-[#12121f] border-b border-white/[0.08] sticky top-0 z-10">
            <tr>
              <th className="px-3 py-3 w-8"></th>
              <SortTh label="Candidate"    col="candidate"    sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Job</th>
              <SortTh label="Stage"        col="stage"        sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Fit</th>
              <SortTh label="Status"       col="status"       sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Submitted by</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {isLoading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>
            )}
            {!isLoading && data?.results.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">No submittals found</td></tr>
            )}
            {data?.results.map(s => (
              <tr key={s.id} className={`hover:bg-white/[0.03] transition-colors duration-100 ${s.is_shortlisted ? 'bg-amber-500/5' : ''}`}>
                <td className="px-3 py-3"><StarButton submittal={s} /></td>
                <td className="px-4 py-3 font-medium text-slate-100">{s.candidate_name}</td>
                <td className="px-4 py-3 text-slate-400">{s.job_title}</td>
                <td className="px-4 py-3">
                  {s.current_stage_name
                    ? <span className="text-violet-400 font-medium">{s.current_stage_name}</span>
                    : <span className="text-slate-500">Not started</span>
                  }
                </td>
                <td className="px-4 py-3"><MatchBadge score={s.match_score} /></td>
                <td className="px-4 py-3"><SubmittalStatusBadge status={s.status} /></td>
                <td className="px-4 py-3 text-slate-500 text-xs">{s.submitted_by}</td>
                <td className="px-4 py-3">
                  {s.status === 'active' && (
                    <div className="flex items-center gap-1">
                      <AdvanceStageDialog submittal={s} onDone={() => {}} />
                      <AddNoteDialog submittal={s} onDone={() => {}} />
                      <MakeOfferDialog submittal={s} onDone={() => {}} />
                      {isManager && (
                        <ChangeStatusDialog
                          submittal={s}
                          onDone={hint => setRejectionHint(hint ?? null)}
                        />
                      )}
                    </div>
                  )}
                  {isManager && s.status !== 'active' && (
                    <span className="text-xs text-slate-500">Closed</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {data && data.count > 10 && (
        <div className="flex items-center justify-between text-sm text-slate-400">
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

      {/* ── Rejection email prompt ── */}
      {rejectionHint && (
        <RejectionEmailPrompt
          hint={rejectionHint}
          onClose={() => setRejectionHint(null)}
        />
      )}

    </div>
  )
}
