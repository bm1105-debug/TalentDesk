import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft, Upload, Download, Trash2, FileText, Loader2, FileDown,
  Mail, Phone, MapPin, Share2, Calendar, Copy, Pencil, MoreHorizontal,
  Plus, Send, CheckCircle, X, ExternalLink,
} from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import api from '@/api/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useAuth } from '@/context/AuthContext'
import InitialsAvatar from '@/components/InitialsAvatar'

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
  linkedin_url: string
  status: string
  source: string
  notes: string
  skills: Skill[]
  years_of_experience: number | null
  created_at: string
}

interface Submittal {
  id: number
  job: number
  job_title: string
  current_stage_name: string | null
  status: string
  created_at: string
}

interface Attachment {
  id: number
  original_name: string
  file_size: number
  uploaded_by: number
  uploaded_by_name: string
  created_at: string
}

interface PaginatedAttachments { results: Attachment[]; count: number }

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function sourceLabel(src: string) {
  const map: Record<string, string> = {
    job_board: 'Job Board', direct: 'Direct', referral: 'Referral', linkedin: 'LinkedIn',
  }
  return map[src] ?? src.replace('_', ' ')
}

const CANDIDATE_STATUS: Record<string, string> = {
  active:      'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
  passive:     'bg-amber-500/15 text-amber-400 border border-amber-500/25',
  placed:      'bg-blue-500/15 text-blue-400 border border-blue-500/25',
  blacklisted: 'bg-red-500/15 text-red-400 border border-red-500/25',
}

const SUBMITTAL_STATUS: Record<string, string> = {
  active:    'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
  placed:    'bg-blue-500/15 text-blue-400 border border-blue-500/25',
  rejected:  'bg-red-500/15 text-red-400 border border-red-500/25',
  withdrawn: 'bg-slate-500/15 text-slate-400 border border-slate-500/25',
}

// ── CopyButton ─────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button onClick={copy} title="Copy" className="ml-1 p-0.5 rounded text-slate-600 hover:text-slate-300 transition-colors shrink-0">
      {copied
        ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
        : <Copy className="h-3.5 w-3.5" />
      }
    </button>
  )
}

// ── Quick Submit Dialog ────────────────────────────────────────────────────────

function QuickSubmitDialog({ candidateId, candidateName }: { candidateId: number; candidateName: string }) {
  const [open, setOpen] = useState(false)
  const [jobId, setJobId] = useState<number | ''>('')
  const [coverNote, setCoverNote] = useState('')
  const qc = useQueryClient()

  const { data: jobs = [] } = useQuery<{ id: number; title: string; client_name: string }[]>({
    queryKey: ['jobs-open'],
    queryFn: () => api.get('/jobs/', { params: { status: 'open', page_size: 200 } }).then(r => r.data.results),
    enabled: open,
  })

  const submit = useMutation({
    mutationFn: () => api.post('/submittals/', { candidate: candidateId, job: jobId, cover_note: coverNote }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['candidate-submittals', String(candidateId)] })
      setOpen(false); setJobId(''); setCoverNote('')
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors">
          <Plus className="h-4 w-4" /> Add Submittal
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Submit {candidateName}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-1">
            <Label>Open job *</Label>
            <select value={jobId} onChange={e => setJobId(Number(e.target.value))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
              <option value="">— select job —</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.title} · {j.client_name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Cover note <span className="text-slate-500 font-normal">(optional)</span></Label>
            <textarea value={coverNote} onChange={e => setCoverNote(e.target.value)} rows={2}
              placeholder="Why this candidate is a great fit…"
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>
          {submit.isError && (
            <p className="text-xs text-red-400">Failed. Candidate may already be submitted to this job.</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={!jobId || submit.isPending} onClick={() => submit.mutate()}>
              {submit.isPending ? 'Submitting…' : 'Submit'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Attachments Tab ────────────────────────────────────────────────────────────

function AttachmentsTab({ candidateId }: { candidateId: number }) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const { data, isLoading } = useQuery<PaginatedAttachments>({
    queryKey: ['attachments', candidateId],
    queryFn: () => api.get('/attachments/', { params: { candidate: candidateId } }).then(r => r.data),
  })

  const destroy = useMutation({
    mutationFn: (id: number) => api.delete(`/attachments/${id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attachments', candidateId] }),
  })

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError('')
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('candidate', String(candidateId))
      await api.post('/attachments/', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      qc.invalidateQueries({ queryKey: ['attachments', candidateId] })
    } catch {
      setUploadError('Upload failed. Try again.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function handleDownload(att: Attachment) {
    window.open(`/api/attachments/${att.id}/download/`, '_blank')
  }

  const canDelete = user?.role === 'vp' || user?.role === 'ceo'

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="outline" className="gap-1.5" disabled={uploading}
          onClick={() => fileInputRef.current?.click()}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? 'Uploading…' : 'Upload file'}
        </Button>
        <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg"
          className="hidden" onChange={handleUpload} />
        <span className="text-xs text-slate-500">PDF, DOCX, TXT, images</span>
      </div>

      {uploadError && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">{uploadError}</p>
      )}

      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}

      {!isLoading && data?.results.length === 0 && (
        <div className="text-center py-10 text-slate-500 text-sm border border-dashed border-white/[0.08] rounded-xl">
          No files uploaded yet
        </div>
      )}

      <div className="space-y-2">
        {data?.results.map(att => (
          <div key={att.id}
            className="flex items-center justify-between px-4 py-3 bg-[#1a1a2e] border border-white/[0.08] rounded-lg">
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="h-5 w-5 text-slate-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-100 truncate">{att.original_name}</p>
                <p className="text-xs text-slate-500">
                  {formatBytes(att.file_size)} · {att.uploaded_by_name} · {fmtDate(att.created_at)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-4">
              <Button size="sm" variant="ghost" onClick={() => handleDownload(att)}>
                <Download className="h-4 w-4" />
              </Button>
              {canDelete && (
                <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300"
                  disabled={destroy.isPending} onClick={() => destroy.mutate(att.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function CandidateDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState<'overview' | 'attachments'>('overview')

  const { data: candidate, isLoading, isError } = useQuery<Candidate>({
    queryKey: ['candidate', id],
    queryFn: () => api.get(`/candidates/${id}/`).then(r => r.data),
    enabled: !!id,
  })

  const { data: submittals = [] } = useQuery<Submittal[]>({
    queryKey: ['candidate-submittals', id],
    queryFn: () => api.get('/submittals/', { params: { candidate: id, page_size: 50 } })
                     .then(r => r.data.results ?? []),
    enabled: !!id,
  })

  const [cvDownloading, setCvDownloading] = useState<'pdf' | 'docx' | null>(null)
  const [editingNotes, setEditingNotes] = useState(false)
  const [noteText, setNoteText] = useState('')

  async function downloadCV(format: 'pdf' | 'docx') {
    if (!candidate) return
    setCvDownloading(format)
    try {
      const res = await api.get(`/cvgen/candidates/${id}/${format}/`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `${candidate.first_name}_${candidate.last_name}_CV.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setCvDownloading(null)
    }
  }

  const saveNotes = useMutation({
    mutationFn: () => api.patch(`/candidates/${id}/`, { notes: noteText }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['candidate', id] })
      setEditingNotes(false)
    },
  })

  if (isLoading) {
    return <div className="text-sm text-slate-500 py-10 text-center">Loading…</div>
  }

  if (isError || !candidate) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/candidates')}
          className="flex items-center gap-1.5 bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.10] rounded-lg px-3 py-1.5 text-sm text-slate-300 transition-colors">
          <ChevronLeft className="h-4 w-4" /> Back to Candidates
        </button>
        <p className="text-sm text-red-400 py-10 text-center">Candidate not found.</p>
      </div>
    )
  }

  const candidateName = `${candidate.first_name} ${candidate.last_name}`
  const statusCls = CANDIDATE_STATUS[candidate.status] ?? 'bg-slate-500/15 text-slate-400 border border-slate-500/25'

  // Build timeline events from candidate data + submittals
  const timelineEvents = [
    { date: candidate.created_at, label: 'Added to system', sub: `via ${sourceLabel(candidate.source)}` },
    ...submittals.map(s => ({
      date: s.created_at,
      label: `Submitted to ${s.job_title}`,
      sub: s.current_stage_name ? `Stage: ${s.current_stage_name}` : undefined,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <div className="space-y-5">

      {/* ── Hero card ─────────────────────────────────────────────────── */}
      <div className="bg-[#1a1a2e] border border-white/[0.08] rounded-xl p-5">
        <div className="flex items-start gap-5">

          <InitialsAvatar
            id={candidate.id}
            firstName={candidate.first_name}
            lastName={candidate.last_name}
            size="xl"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', flexShrink: 0 }}
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
                {candidateName}
              </h1>
              <span className={`priority-badge ${statusCls}`}>{candidate.status}</span>
            </div>

            <p className="text-sm text-slate-400 mt-1">
              {candidate.current_title || 'No title'}
              {candidate.current_company && ` · ${candidate.current_company}`}
            </p>

            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 bg-white/[0.06] border border-white/[0.08] text-slate-400 text-xs rounded-md px-2 py-0.5">
                <Share2 className="h-3 w-3" />{sourceLabel(candidate.source)}
              </span>
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Added {fmtDate(candidate.created_at)}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <QuickSubmitDialog candidateId={candidate.id} candidateName={candidateName} />

            <button
              onClick={() => navigate('/communications')}
              className="flex items-center gap-1.5 bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.10] text-slate-300 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              <Send className="h-4 w-4" /> Send Email
            </button>

            {/* Overflow: PDF / DOCX downloads */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-400 hover:text-slate-200 transition-colors"
                  aria-label="More actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content side="bottom" align="end" sideOffset={6}
                  className="min-w-[160px] rounded-xl shadow-2xl p-1 z-50"
                  style={{ background: 'var(--td-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <DropdownMenu.Item
                    onSelect={() => downloadCV('pdf')}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 rounded-lg hover:bg-white/5 hover:text-slate-200 cursor-pointer outline-none transition-colors"
                  >
                    {cvDownloading === 'pdf'
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <FileDown className="h-3.5 w-3.5" />}
                    Download PDF
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={() => downloadCV('docx')}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 rounded-lg hover:bg-white/5 hover:text-slate-200 cursor-pointer outline-none transition-colors"
                  >
                    {cvDownloading === 'docx'
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <FileDown className="h-3.5 w-3.5" />}
                    Download DOCX
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </div>

      {/* ── Pill tabs ─────────────────────────────────────────────────── */}
      <div className="inline-flex bg-white/[0.05] rounded-lg p-1 gap-1">
        {(['overview', 'attachments'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Attachments tab ───────────────────────────────────────────── */}
      {tab === 'attachments' && <AttachmentsTab candidateId={Number(id)} />}

      {/* ── Overview tab ─────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-4">

          {/* Contact + Details side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Contact */}
            <div className="bg-[#1a1a2e] border border-white/[0.08] rounded-xl p-5 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Contact</p>
              <dl className="space-y-2.5">
                <div className="flex items-start gap-3">
                  <dt className="flex items-center gap-1.5 text-slate-400 text-sm w-24 shrink-0 pt-px">
                    <Mail className="h-3.5 w-3.5 shrink-0" /> Email
                  </dt>
                  <dd className="text-slate-100 text-sm break-all flex items-start min-w-0">
                    <span className="min-w-0 truncate">{candidate.email || '—'}</span>
                    {candidate.email && <CopyButton text={candidate.email} />}
                  </dd>
                </div>
                <div className="flex items-start gap-3">
                  <dt className="flex items-center gap-1.5 text-slate-400 text-sm w-24 shrink-0 pt-px">
                    <Phone className="h-3.5 w-3.5 shrink-0" /> Phone
                  </dt>
                  <dd className="text-slate-100 text-sm flex items-center min-w-0">
                    <span>{candidate.phone || '—'}</span>
                    {candidate.phone && <CopyButton text={candidate.phone} />}
                  </dd>
                </div>
                {candidate.location && (
                  <div className="flex items-start gap-3">
                    <dt className="flex items-center gap-1.5 text-slate-400 text-sm w-24 shrink-0 pt-px">
                      <MapPin className="h-3.5 w-3.5 shrink-0" /> Location
                    </dt>
                    <dd className="text-slate-100 text-sm">{candidate.location}</dd>
                  </div>
                )}
                {candidate.linkedin_url && (
                  <div className="flex items-start gap-3">
                    <dt className="flex items-center gap-1.5 text-slate-400 text-sm w-24 shrink-0 pt-px">
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" /> LinkedIn
                    </dt>
                    <dd className="text-sm min-w-0">
                      <a href={candidate.linkedin_url} target="_blank" rel="noreferrer"
                        className="text-violet-400 hover:underline truncate block max-w-[180px]">
                        View profile
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Details */}
            <div className="bg-[#1a1a2e] border border-white/[0.08] rounded-xl p-5 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Details</p>
              <dl className="space-y-2.5">
                <div className="flex items-start gap-3">
                  <dt className="flex items-center gap-1.5 text-slate-400 text-sm w-24 shrink-0 pt-px">
                    <Share2 className="h-3.5 w-3.5 shrink-0" /> Source
                  </dt>
                  <dd className="text-slate-100 text-sm capitalize">{sourceLabel(candidate.source)}</dd>
                </div>
                <div className="flex items-start gap-3">
                  <dt className="flex items-center gap-1.5 text-slate-400 text-sm w-24 shrink-0 pt-px">
                    <Calendar className="h-3.5 w-3.5 shrink-0" /> Added
                  </dt>
                  <dd className="text-slate-100 text-sm">{fmtDate(candidate.created_at)}</dd>
                </div>
                {candidate.years_of_experience != null && (
                  <div className="flex items-start gap-3">
                    <dt className="flex items-center gap-1.5 text-slate-400 text-sm w-24 shrink-0 pt-px">
                      <FileText className="h-3.5 w-3.5 shrink-0" /> Experience
                    </dt>
                    <dd className="text-slate-100 text-sm">
                      {candidate.years_of_experience} yr{candidate.years_of_experience !== 1 ? 's' : ''}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          {/* Skills */}
          {candidate.skills.length > 0 && (
            <div className="bg-[#1a1a2e] border border-white/[0.08] rounded-xl p-5 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Skills</p>
              <div className="flex flex-wrap gap-2">
                {candidate.skills.map(s => (
                  <span key={s.id}
                    className="bg-slate-800 border border-white/[0.10] text-slate-200 text-xs font-medium px-2.5 py-1 rounded-md">
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="bg-[#1a1a2e] border border-white/[0.08] rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Notes</p>
              {!editingNotes && (
                <button
                  onClick={() => { setNoteText(candidate.notes ?? ''); setEditingNotes(true) }}
                  className="p-1 rounded text-slate-600 hover:text-slate-300 transition-colors"
                  title="Edit notes"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {editingNotes ? (
              <div className="space-y-2">
                <textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  rows={5}
                  placeholder="Add notes about this candidate…"
                  className="w-full bg-[#12121f] border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500/60 resize-none"
                />
                <div className="flex items-center gap-2 justify-end">
                  <button
                    onClick={() => setEditingNotes(false)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" /> Cancel
                  </button>
                  <Button size="sm" disabled={saveNotes.isPending} onClick={() => saveNotes.mutate()}>
                    {saveNotes.isPending ? 'Saving…' : 'Save'}
                  </Button>
                </div>
                {saveNotes.isError && (
                  <p className="text-xs text-red-400">Failed to save. Please try again.</p>
                )}
              </div>
            ) : (
              candidate.notes
                ? <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{candidate.notes}</p>
                : <p className="text-sm text-slate-600 italic">No notes yet. Click the pencil to add one.</p>
            )}
          </div>

          {/* Submissions */}
          <div className="bg-[#1a1a2e] border border-white/[0.08] rounded-xl p-5 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Submissions</p>

            {submittals.length === 0 ? (
              <p className="text-sm text-slate-600 italic">No submissions yet.</p>
            ) : (
              <div className="space-y-2">
                {submittals.map(s => (
                  <div key={s.id}
                    className="flex items-center justify-between px-3 py-2.5 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-100 truncate">{s.job_title}</p>
                      {s.current_stage_name && (
                        <p className="text-xs text-violet-400 font-medium mt-0.5">{s.current_stage_name}</p>
                      )}
                    </div>
                    <span className={`priority-badge ml-3 shrink-0 ${SUBMITTAL_STATUS[s.status] ?? 'bg-slate-500/15 text-slate-400 border border-slate-500/25'}`}>
                      {s.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="bg-[#1a1a2e] border border-white/[0.08] rounded-xl p-5 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Activity</p>

            <div className="relative pl-5 space-y-4">
              <div className="absolute left-1.5 top-1 bottom-1 w-px bg-violet-500/25" />
              {timelineEvents.map((ev, i) => (
                <div key={i} className="relative">
                  <div className="absolute -left-[14px] top-1.5 h-2 w-2 rounded-full bg-violet-500 border-2 border-[#1a1a2e] z-10" />
                  <p className="text-sm text-slate-200">{ev.label}</p>
                  {ev.sub && <p className="text-xs text-slate-500 mt-0.5">{ev.sub}</p>}
                  <p className="text-xs text-slate-600 mt-0.5">{fmtDate(ev.date)}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
