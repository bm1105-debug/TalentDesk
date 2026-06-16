import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, ChevronLeft, ChevronRight, CheckCircle, XCircle, Star, List, CalendarDays } from 'lucide-react'
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
  score: number | null
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

const STATUS_CHIP: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-600',
  no_show:   'bg-red-100 text-red-700',
}

const TYPE_LABEL: Record<string, string> = {
  phone: 'Phone', video: 'Video', in_person: 'In Person', technical: 'Technical',
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

// Build a flat array of Date|null for the month grid, padded to full weeks
function buildMonthGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startPad = firstDay.getDay() // 0=Sun
  const cells: (Date | null)[] = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
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

// ── Score Dialog ───────────────────────────────────────────────────────────────

function ScoreDialog({ interview }: { interview: Interview }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [score, setScore] = useState<string>(interview.score != null ? String(interview.score) : '')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const save = useMutation({
    mutationFn: () => api.patch(`/interviews/${interview.id}/`, {
      score: score !== '' ? Number(score) : null,
      notes: notes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['interviews'] })
      setOpen(false)
      setError('')
    },
    onError: () => setError('Failed to save. Check score is 0–100.'),
  })

  if (interview.status !== 'completed') return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={interview.score != null ? 'Edit score' : 'Add score'}
        className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
      >
        <Star className="h-3 w-3 text-amber-400" />
        {interview.score != null ? (
          <span className="font-semibold text-gray-700">{interview.score}/100</span>
        ) : (
          <span className="text-gray-400">Score</span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Score Interview — {interview.candidate_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label>Score (0–100)</Label>
              <Input
                type="number" min={0} max={100}
                value={score}
                onChange={e => setScore(e.target.value)}
                placeholder="e.g. 78"
              />
            </div>
            <div className="space-y-1">
              <Label>Feedback notes <span className="text-gray-400 font-normal">(appended to existing)</span></Label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Strong problem-solving skills…"
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? 'Saving…' : 'Save Score'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── Calendar View ──────────────────────────────────────────────────────────────

function CalendarView({ year, month }: { year: number; month: number }) {
  const [selected, setSelected] = useState<Interview | null>(null)

  const firstDay = new Date(year, month, 1)
  const lastDay  = new Date(year, month + 1, 0)

  const { data, isLoading } = useQuery<PaginatedInterviews>({
    queryKey: ['interviews', 'calendar', year, month],
    queryFn: () => api.get('/interviews/', {
      params: {
        scheduled_after:  isoDate(firstDay),
        scheduled_before: isoDate(lastDay),
        page_size: 200,
      },
    }).then(r => r.data),
  })

  const interviews = data?.results ?? []
  const cells = buildMonthGrid(year, month)

  // Group interviews by date string "YYYY-MM-DD"
  const byDate: Record<string, Interview[]> = {}
  for (const iv of interviews) {
    const d = iv.scheduled_at.slice(0, 10)
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(iv)
  }

  const today = isoDate(new Date())

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {DAY_NAMES.map(d => (
          <div key={d} className="py-2 text-center text-xs font-medium text-gray-400 uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      {isLoading ? (
        <div className="py-20 text-center text-sm text-gray-400">Loading…</div>
      ) : (
        <div className="grid grid-cols-7">
          {cells.map((date, idx) => {
            const key = date ? isoDate(date) : `pad-${idx}`
            const dayInterviews = date ? (byDate[isoDate(date)] ?? []) : []
            const isToday = date ? isoDate(date) === today : false

            return (
              <div
                key={key}
                className={`min-h-[100px] border-b border-r border-gray-100 p-1.5 ${
                  !date ? 'bg-gray-50' : ''
                }`}
              >
                {date && (
                  <>
                    <span className={`inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full mb-1 ${
                      isToday
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-600'
                    }`}>
                      {date.getDate()}
                    </span>
                    <div className="space-y-0.5">
                      {dayInterviews.map(iv => (
                        <button
                          key={iv.id}
                          onClick={() => setSelected(iv)}
                          className={`w-full text-left text-xs px-1.5 py-0.5 rounded truncate font-medium ${STATUS_CHIP[iv.status] ?? 'bg-gray-100 text-gray-700'}`}
                        >
                          {fmtTime(iv.scheduled_at)} {iv.candidate_name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Interview detail popover */}
      {selected && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30"
          onClick={() => setSelected(null)}>
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-5 w-80 space-y-3"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-gray-900">{selected.candidate_name}</p>
                <p className="text-sm text-gray-500">{selected.job_title}</p>
              </div>
              <Badge variant={STATUS_VARIANT[selected.status] ?? 'secondary'}>
                {selected.status.replace('_', ' ')}
              </Badge>
            </div>
            <dl className="text-sm space-y-1.5">
              <div className="flex gap-2">
                <dt className="text-gray-400 w-20 shrink-0">Type</dt>
                <dd className="text-gray-700">{TYPE_LABEL[selected.interview_type] ?? selected.interview_type}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-gray-400 w-20 shrink-0">Time</dt>
                <dd className="text-gray-700">{fmtDateTime(selected.scheduled_at)}</dd>
              </div>
              {selected.duration_minutes && (
                <div className="flex gap-2">
                  <dt className="text-gray-400 w-20 shrink-0">Duration</dt>
                  <dd className="text-gray-700">{selected.duration_minutes} mins</dd>
                </div>
              )}
              {selected.meeting_link && (
                <div className="flex gap-2">
                  <dt className="text-gray-400 w-20 shrink-0">Link</dt>
                  <dd>
                    <a href={selected.meeting_link} target="_blank" rel="noreferrer"
                      className="text-blue-600 hover:underline truncate block max-w-[180px]">
                      Join
                    </a>
                  </dd>
                </div>
              )}
              {selected.location && (
                <div className="flex gap-2">
                  <dt className="text-gray-400 w-20 shrink-0">Location</dt>
                  <dd className="text-gray-700">{selected.location}</dd>
                </div>
              )}
              {selected.score != null && (
                <div className="flex gap-2">
                  <dt className="text-gray-400 w-20 shrink-0">Score</dt>
                  <dd className="text-gray-700 font-semibold">{selected.score}/100</dd>
                </div>
              )}
            </dl>
            <div className="pt-1 border-t border-gray-100 flex justify-end">
              <button onClick={() => setSelected(null)}
                className="text-sm text-gray-500 hover:text-gray-700">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── List View ─────────────────────────────────────────────────────────────────

function ListView({ statusFilter, page, setPage }: {
  statusFilter: string
  page: number
  setPage: (fn: (p: number) => number) => void
}) {
  const { data, isLoading } = useQuery<PaginatedInterviews>({
    queryKey: ['interviews', statusFilter, page],
    queryFn:  () => api.get('/interviews/', {
      params: { status: statusFilter || undefined, page },
    }).then(r => r.data),
    placeholderData: prev => prev,
  })

  const totalPages = data ? Math.ceil(data.count / 10) : 1

  return (
    <>
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
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <StatusButtons interview={i} />
                    <ScoreDialog interview={i} />
                  </div>
                </td>
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
    </>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Interviews() {
  const [view,         setView]         = useState<'list' | 'calendar'>('list')
  const [statusFilter, setStatusFilter] = useState('')
  const [page,         setPage]         = useState(1)
  const [dialogOpen,   setDialogOpen]   = useState(false)

  const now = new Date()
  const [calYear,  setCalYear]  = useState(now.getFullYear())
  const [calMonth, setCalMonth] = useState(now.getMonth())

  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) }
    else setCalMonth(m => m - 1)
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) }
    else setCalMonth(m => m + 1)
  }

  return (
    <div className="space-y-4">

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Interviews</h1>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center rounded-md border border-gray-200 overflow-hidden">
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
                view === 'list' ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <List className="h-4 w-4" /> List
            </button>
            <button
              onClick={() => setView('calendar')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 border-l border-gray-200 transition-colors ${
                view === 'calendar' ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <CalendarDays className="h-4 w-4" /> Calendar
            </button>
          </div>

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
      </div>

      {view === 'list' && (
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
      )}

      {view === 'calendar' && (
        <div className="flex items-center gap-3">
          <button onClick={prevMonth}
            className="p-1.5 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors">
            <ChevronLeft className="h-4 w-4 text-gray-600" />
          </button>
          <span className="text-sm font-medium text-gray-900 w-36 text-center">
            {MONTH_NAMES[calMonth]} {calYear}
          </span>
          <button onClick={nextMonth}
            className="p-1.5 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors">
            <ChevronRight className="h-4 w-4 text-gray-600" />
          </button>
        </div>
      )}

      {view === 'list'
        ? <ListView statusFilter={statusFilter} page={page} setPage={setPage} />
        : <CalendarView year={calYear} month={calMonth} />
      }
    </div>
  )
}
