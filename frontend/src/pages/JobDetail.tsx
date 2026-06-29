import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ChevronLeft, ArrowRight, StickyNote, HandCoins, Star, LayoutGrid, List } from 'lucide-react'
import {
  DndContext, PointerSensor, useSensor, useSensors,
  useDraggable, useDroppable,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import api from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/StatusBadge'
import InitialsAvatar from '@/components/InitialsAvatar'

// ── Types ──────────────────────────────────────────────────────────────────────

interface PipelineStage { id: number; name: string; order: number }

interface Job {
  id: number
  title: string
  client_name: string
  status: string
  priority: string
  salary_min: string | null
  salary_max: string | null
  target_date: string | null
  openings: number
  stages: PipelineStage[]
  description: string
  requirements: string
}

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
  candidate_last_contacted_at: string | null
  submitted_by: string
}

interface PaginatedSubmittals {
  results: Submittal[]
  count: number
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtSalary(min: string | null, max: string | null): string {
  if (!min && !max) return '—'
  const fmt = (v: string) => `$${Number(v).toLocaleString()}`
  if (min && max) return `${fmt(min)} – ${fmt(max)}`
  return fmt((min ?? max)!)
}

function fmtLastContacted(dt: string | null): string {
  if (!dt) return 'Never'
  const days = Math.floor((Date.now() - new Date(dt).getTime()) / 86_400_000)
  return days === 0 ? 'Today' : `${days}d ago`
}

// ── Match Score Badge ──────────────────────────────────────────────────────────

function MatchBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-slate-600 text-xs">—</span>
  const cls =
    score >= 70 ? 'bg-blue-500/15 text-blue-400' :
    score >= 40 ? 'bg-amber-500/15 text-amber-400' :
                  'bg-red-500/15 text-red-400'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {score}
    </span>
  )
}

// ── Star Toggle ────────────────────────────────────────────────────────────────

function StarButton({ submittal }: { submittal: Submittal }) {
  const qc = useQueryClient()
  const toggle = useMutation({
    mutationFn: () => api.patch(`/submittals/${submittal.id}/`, { is_shortlisted: !submittal.is_shortlisted }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['job-submittals', submittal.job] }),
  })
  return (
    <button onClick={() => toggle.mutate()} disabled={toggle.isPending}
      title={submittal.is_shortlisted ? 'Remove from shortlist' : 'Add to shortlist'}
      className="p-1 rounded hover:bg-amber-500/10 transition-colors disabled:opacity-40">
      <Star className={`h-4 w-4 transition-colors ${
        submittal.is_shortlisted ? 'fill-amber-400 stroke-amber-400' : 'stroke-slate-500 hover:stroke-amber-400'
      }`} />
    </button>
  )
}

// ── Advance Stage Dialog ───────────────────────────────────────────────────────

function AdvanceStageDialog({ submittal, stages }: { submittal: Submittal; stages: PipelineStage[] }) {
  const [open,    setOpen]    = useState(false)
  const [stageId, setStageId] = useState<number | ''>('')
  const [notes,   setNotes]   = useState('')
  const qc = useQueryClient()

  const advance = useMutation({
    mutationFn: () => api.post(`/submittals/${submittal.id}/advance/`, { stage_id: stageId, notes }),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['job-submittals', submittal.job] })
      setOpen(false); setStageId(''); setNotes('')
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-blue-400 hover:text-blue-300">
          <ArrowRight className="h-3.5 w-3.5" /> Advance
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Advance Stage</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-slate-500">{submittal.candidate_name}</p>
          <p className="text-xs text-slate-500">Current: {submittal.current_stage_name ?? 'Not started'}</p>
          <div className="space-y-1">
            <Label>Move to stage</Label>
            <select value={stageId} onChange={e => setStageId(Number(e.target.value))}
              className="flex h-9 w-full rounded-md border border-white/[0.12] bg-[#0d1117] text-slate-200 px-3 py-1 text-sm shadow-sm">
              <option value="">— pick stage —</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Notes <span className="text-slate-500 font-normal">(optional)</span></Label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={!stageId || advance.isPending} onClick={() => advance.mutate()}>
              {advance.isPending ? 'Saving…' : 'Confirm'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Add Note Dialog ────────────────────────────────────────────────────────────

function AddNoteDialog({ submittal }: { submittal: Submittal }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const qc = useQueryClient()

  const addNote = useMutation({
    mutationFn: () => api.post(`/submittals/${submittal.id}/add-note/`, { notes: note }),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['job-submittals', submittal.job] })
      setOpen(false); setNote('')
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-slate-500 hover:text-slate-300">
          <StickyNote className="h-3.5 w-3.5" /> Note
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Add Note</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-slate-500">{submittal.candidate_name}</p>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
            placeholder="Client feedback, interview outcome…"
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}>
              {addNote.isPending ? 'Saving…' : 'Save Note'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Make Offer Dialog ──────────────────────────────────────────────────────────

const offerSchema = z.object({
  salary:      z.coerce.number().positive('Required'),
  currency:    z.string().min(3).max(3).default('USD'),
  offer_date:  z.string().min(1, 'Required'),
  expiry_date: z.string().optional(),
  start_date:  z.string().optional(),
  notes:       z.string().optional(),
})
type OfferFormValues = z.infer<typeof offerSchema>

function MakeOfferDialog({ submittal }: { submittal: Submittal }) {
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
      qc.invalidateQueries({ queryKey: ['job-submittals', submittal.job] })
      qc.invalidateQueries({ queryKey: ['offers'] })
      reset(); setOpen(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-blue-400 hover:text-blue-300">
          <HandCoins className="h-3.5 w-3.5" /> Offer
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Make Offer — {submittal.candidate_name}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(v => create.mutateAsync(v))} className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label>Salary *</Label>
              <input {...register('salary')} type="number" placeholder="75000"
                className="flex h-9 w-full rounded-md border border-white/[0.12] bg-[#09090f] text-slate-200 px-3 py-1 text-sm shadow-sm" />
              {errors.salary && <p className="text-xs text-red-500">{errors.salary.message}</p>}
            </div>
            <div className="w-20 space-y-1">
              <Label>Currency</Label>
              <input {...register('currency')} maxLength={3}
                className="flex h-9 w-full rounded-md border border-white/[0.12] bg-[#09090f] text-slate-200 px-3 py-1 text-sm shadow-sm uppercase" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Offer date *</Label>
            <input {...register('offer_date')} type="date"
              className="flex h-9 w-full rounded-md border border-white/[0.12] bg-[#09090f] text-slate-200 px-3 py-1 text-sm shadow-sm" />
            {errors.offer_date && <p className="text-xs text-red-500">{errors.offer_date.message}</p>}
          </div>
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label>Expiry <span className="text-slate-500 font-normal">(opt)</span></Label>
              <input {...register('expiry_date')} type="date"
                className="flex h-9 w-full rounded-md border border-white/[0.12] bg-[#09090f] text-slate-200 px-3 py-1 text-sm shadow-sm" />
            </div>
            <div className="flex-1 space-y-1">
              <Label>Start <span className="text-slate-500 font-normal">(opt)</span></Label>
              <input {...register('start_date')} type="date"
                className="flex h-9 w-full rounded-md border border-white/[0.12] bg-[#09090f] text-slate-200 px-3 py-1 text-sm shadow-sm" />
            </div>
          </div>
          {create.isError && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
              Failed. There may already be a pending offer.
            </p>
          )}
          <div className="flex justify-end gap-2">
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

// ── Kanban View ───────────────────────────────────────────────────────────────

function KanbanCard({ submittal, isError }: { submittal: Submittal; isError: boolean }) {
  const { isAuthenticated } = useAuth()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: submittal.id })
  return (
    <div
      ref={setNodeRef} {...listeners} {...attributes}
      className={`bg-[#0d1117] border rounded-lg p-3 cursor-grab active:cursor-grabbing select-none transition-all ${
        isDragging ? 'opacity-40 shadow-lg scale-95' : ''
      } ${isError ? 'border-red-400 bg-red-500/10' : 'border-white/[0.06] hover:border-white/[0.12] hover:shadow-sm'}`}
    >
      <div className="flex items-start gap-2">
        <InitialsAvatar id={submittal.candidate} firstName={submittal.candidate_name.split(' ')[0]} lastName={submittal.candidate_name.split(' ')[1] ?? ''} size="sm" />
        <div className="min-w-0 flex-1">
          <Link
            to={`/candidates/${submittal.candidate}`}
            onClick={e => e.stopPropagation()}
            className="text-sm font-medium text-slate-100 hover:text-blue-400 hover:underline block truncate"
          >
            {submittal.candidate_name}
          </Link>
          <p className="text-xs text-slate-500 mt-0.5">{submittal.current_stage_name ?? 'Not started'}</p>
        </div>
        {isAuthenticated && <StarButton submittal={submittal} />}
      </div>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/[0.06]">
        <MatchBadge score={submittal.match_score} />
        <span className="text-[10px] text-slate-500">{fmtLastContacted(submittal.candidate_last_contacted_at)}</span>
      </div>
      {isError && <p className="text-[10px] text-red-500 mt-1">Failed to move — reverted</p>}
    </div>
  )
}

function KanbanColumn({ stageId, stageName, submittals, errorId }: {
  stageId: number; stageName: string; submittals: Submittal[]; errorId: number | null
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stageId })
  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-56 flex flex-col rounded-xl border transition-colors ${
        isOver ? 'border-blue-500/50 bg-blue-500/5' : 'border-white/[0.06] bg-white/[0.02]'
      }`}
    >
      <div className="px-3 py-2.5 border-b border-white/[0.06]">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{stageName}</span>
        <span className="ml-2 text-xs text-slate-500">{submittals.length}</span>
      </div>
      <div className="flex-1 p-2 space-y-2 min-h-[120px]">
        {submittals.map(s => (
          <KanbanCard key={s.id} submittal={s} isError={errorId === s.id} />
        ))}
        {submittals.length === 0 && (
          <div className={`h-16 rounded-lg border-2 border-dashed flex items-center justify-center text-xs text-slate-600 ${isOver ? 'border-blue-500/50' : 'border-white/[0.06]'}`}>
            Drop here
          </div>
        )}
      </div>
    </div>
  )
}

function KanbanClosedColumn({ submittals }: { submittals: Submittal[] }) {
  return (
    <div className="flex-shrink-0 w-56 flex flex-col rounded-xl border border-white/[0.06] bg-white/[0.02] opacity-60">
      <div className="px-3 py-2.5 border-b border-white/[0.06]">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Closed</span>
        <span className="ml-2 text-xs text-slate-500">{submittals.length}</span>
      </div>
      <div className="flex-1 p-2 space-y-2">
        {submittals.map(s => (
          <div key={s.id} className="bg-[#0d1117] border border-white/[0.06] rounded-lg p-3">
            <p className="text-sm font-medium text-slate-500 truncate">{s.candidate_name}</p>
            <p className="text-xs text-slate-500 capitalize mt-0.5">{s.status}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function KanbanView({ job, allSubmittals }: { job: Job; allSubmittals: Submittal[] }) {
  const qc = useQueryClient()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const [optimisticMoves, setOptimisticMoves] = useState<Record<number, number>>({})
  const [errorId, setErrorId] = useState<number | null>(null)

  const advance = useMutation({
    mutationFn: ({ id, stageId }: { id: number; stageId: number }) =>
      api.post(`/submittals/${id}/advance/`, { stage_id: stageId }),
    onSuccess: (_, vars) => {
      setOptimisticMoves(prev => { const n = { ...prev }; delete n[vars.id]; return n })
      qc.invalidateQueries({ queryKey: ['job-submittals', job.id] })
    },
    onError: (_, vars) => {
      setOptimisticMoves(prev => { const n = { ...prev }; delete n[vars.id]; return n })
      setErrorId(vars.id)
      setTimeout(() => setErrorId(null), 3000)
    },
  })

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const submittalId  = active.id as number
    const targetStageId = over.id as number
    const submittal = allSubmittals.find(s => s.id === submittalId)
    if (!submittal || submittal.current_stage === targetStageId) return
    setOptimisticMoves(prev => ({ ...prev, [submittalId]: targetStageId }))
    advance.mutate({ id: submittalId, stageId: targetStageId })
  }

  const columns = job.stages.map(stage => ({
    stage,
    submittals: allSubmittals.filter(s => {
      if (s.status !== 'active') return false
      const movedTo = optimisticMoves[s.id]
      return movedTo !== undefined ? movedTo === stage.id : s.current_stage === stage.id
    }),
  }))

  const closedSubmittals = allSubmittals.filter(s => s.status === 'rejected' || s.status === 'withdrawn')

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {columns.map(col => (
          <KanbanColumn
            key={col.stage.id}
            stageId={col.stage.id}
            stageName={col.stage.name}
            submittals={col.submittals}
            errorId={errorId}
          />
        ))}
        <KanbanClosedColumn submittals={closedSubmittals} />
      </div>
    </DndContext>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function JobDetail() {
  const { isAuthenticated } = useAuth()
  const { id }    = useParams<{ id: string }>()
  const navigate  = useNavigate()
  const [stageFilter, setStageFilter] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>(
    () => (localStorage.getItem('job_detail_view_mode') as 'list' | 'kanban') ?? 'list'
  )

  function toggleViewMode() {
    const next = viewMode === 'list' ? 'kanban' : 'list'
    setViewMode(next)
    localStorage.setItem('job_detail_view_mode', next)
  }

  const { data: job, isLoading: jobLoading, isError } = useQuery<Job>({
    queryKey: ['job', id],
    queryFn:  () => api.get(`/jobs/${id}/`).then(r => r.data),
  })

  const { data: submittalsData, isLoading: subsLoading } = useQuery<PaginatedSubmittals>({
    queryKey: ['job-submittals', Number(id)],
    queryFn:  () => api.get('/submittals/', { params: { job: id, page_size: 200 } }).then(r => r.data),
    enabled:  !!id,
  })

  const allSubmittals = submittalsData?.results ?? []

  // Count active submittals per stage for the funnel
  const stageCounts = (job?.stages ?? []).reduce<Record<number, number>>((acc, stage) => {
    acc[stage.id] = allSubmittals.filter(
      s => s.status === 'active' && s.current_stage === stage.id
    ).length
    return acc
  }, {})
  const maxCount = Math.max(...Object.values(stageCounts), 1)

  // Apply stage filter to the candidate list
  const displayed = stageFilter
    ? allSubmittals.filter(s => s.current_stage === stageFilter)
    : allSubmittals

  if (isError) return (
    <div className="space-y-4">
      <button
        onClick={() => navigate('/jobs')}
        className="flex items-center gap-1.5 bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.10] rounded-lg px-3 py-1.5 text-sm text-slate-300 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" /> Back to Jobs
      </button>
      <p className="text-red-500">Job not found.</p>
    </div>
  )

  return (
    <div className="space-y-6">

      {/* ── Back link ── */}
      <button
        onClick={() => navigate('/jobs')}
        className="flex items-center gap-1.5 bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.10] rounded-lg px-3 py-1.5 text-sm text-slate-300 transition-colors"
      >
        <ChevronLeft className="h-4 w-4" /> Back to Jobs
      </button>

      {/* ── Header ── */}
      {jobLoading ? (
        <div className="animate-pulse space-y-2">
          <div className="h-7 bg-white/[0.08] rounded w-1/3" />
          <div className="h-4 bg-white/[0.05] rounded w-1/4" />
        </div>
      ) : job && (
        <div className="bg-[#0d1117] border border-white/[0.06] rounded-xl p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-100">{job.title}</h1>
              <p className="text-slate-500 mt-1">{job.client_name}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge status={job.status.replace('_', ' ')} />
              <StatusBadge status={job.priority} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-6 pt-6 border-t border-white/[0.06] text-sm">
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Salary</p>
              <p className="font-medium text-slate-100">{fmtSalary(job.salary_min, job.salary_max)}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Target date</p>
              <p className="font-medium text-slate-100">
                {job.target_date ? new Date(job.target_date).toLocaleDateString() : '—'}
              </p>
            </div>
            <div>
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Openings</p>
              <p className="font-medium text-slate-100">{job.openings}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Pipeline / Kanban ── */}
      {job && (
        <div className="bg-[#0d1117] border border-white/[0.06] rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-300">Pipeline</h2>
            <button
              onClick={toggleViewMode}
              title={viewMode === 'list' ? 'Switch to Kanban view' : 'Switch to list view'}
              className="p-1.5 rounded-md border border-input text-slate-400 hover:bg-white/[0.03] transition-colors"
            >
              {viewMode === 'list' ? <LayoutGrid className="h-4 w-4" /> : <List className="h-4 w-4" />}
            </button>
          </div>

          {viewMode === 'kanban' ? (
            <KanbanView job={job} allSubmittals={allSubmittals} />
          ) : (
            <>
              {job.stages.length === 0 ? (
                <p className="text-sm text-slate-500">No pipeline stages defined.</p>
              ) : (
                <div className="space-y-2">
                  {job.stages.map(stage => {
                    const count  = stageCounts[stage.id] ?? 0
                    const pct    = Math.round((count / maxCount) * 100)
                    const active = stageFilter === stage.id
                    return (
                      <button
                        key={stage.id}
                        onClick={() => setStageFilter(active ? null : stage.id)}
                        className={`w-full flex items-center gap-3 group rounded-lg px-2 py-1.5 transition-colors ${
                          active ? 'bg-blue-500/10' : 'hover:bg-white/[0.03]'
                        }`}
                      >
                        <span className={`text-xs w-32 text-left truncate ${active ? 'text-blue-400 font-medium' : 'text-slate-500'}`}>
                          {stage.name}
                        </span>
                        <div className="flex-1 bg-white/[0.06] rounded-full h-5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${active ? 'bg-blue-500' : 'bg-blue-400/50 group-hover:bg-blue-400/70'}`}
                            style={{ width: count === 0 ? '0%' : `${Math.max(pct, 3)}%` }}
                          />
                        </div>
                        <span className={`text-xs w-8 text-right font-medium ${active ? 'text-blue-400' : 'text-slate-500'}`}>
                          {count}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              {stageFilter && (
                <button
                  onClick={() => setStageFilter(null)}
                  className="mt-3 text-xs text-blue-400 hover:underline"
                >
                  Clear stage filter
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Candidate List ── */}
      <div className="bg-[#0d1117] border border-white/[0.06] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">
            Candidates
            {stageFilter && job && (
              <span className="ml-2 font-normal text-slate-500">
                · {job.stages.find(s => s.id === stageFilter)?.name}
              </span>
            )}
          </h2>
          <span className="text-xs text-slate-500">{displayed.length} submittal{displayed.length !== 1 ? 's' : ''}</span>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-white/[0.04] border-b border-white/[0.06]">
            <tr>
              <th className="px-3 py-3 w-8" />
              <th className="text-left px-4 py-3 font-medium text-slate-400">Candidate</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Fit</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Stage</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Last contacted</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {(jobLoading || subsLoading) && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>
            )}
            {!jobLoading && !subsLoading && displayed.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No candidates in this view</td></tr>
            )}
            {displayed.map(s => (
              <tr key={s.id} className={`transition-colors hover:bg-white/[0.03] ${s.is_shortlisted ? 'bg-amber-500/5' : ''}`}>
                <td className="px-3 py-3">{isAuthenticated && <StarButton submittal={s} />}</td>
                <td className="px-4 py-3">
                  <Link
                    to={`/candidates/${s.candidate}`}
                    className="font-medium text-slate-100 hover:text-blue-400 hover:underline"
                    onClick={e => e.stopPropagation()}
                  >
                    {s.candidate_name}
                  </Link>
                </td>
                <td className="px-4 py-3"><MatchBadge score={s.match_score} /></td>
                <td className="px-4 py-3 text-slate-400">
                  {s.current_stage_name
                    ? <span className="text-blue-400 font-medium">{s.current_stage_name}</span>
                    : <span className="text-slate-500">Not started</span>
                  }
                </td>
                <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                  {fmtLastContacted(s.candidate_last_contacted_at)}
                </td>
                <td className="px-4 py-3">
                  {isAuthenticated && s.status === 'active' && job && (
                    <div className="flex items-center gap-1">
                      <AdvanceStageDialog submittal={s} stages={job.stages} />
                      <AddNoteDialog submittal={s} />
                      <MakeOfferDialog submittal={s} />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  )
}
