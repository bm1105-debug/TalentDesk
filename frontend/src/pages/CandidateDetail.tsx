import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Upload, Download, Trash2, FileText, Loader2, FileDown } from 'lucide-react'
import api from '@/api/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/StatusBadge'
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

interface Attachment {
  id: number
  original_name: string
  file_size: number
  uploaded_by: number
  uploaded_by_name: string
  created_at: string
}

interface PaginatedAttachments {
  results: Attachment[]
  count: number
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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

  const canDelete = user?.role === 'account_manager' || user?.role === 'ceo'

  return (
    <div className="space-y-4">

      {/* Upload button */}
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? 'Uploading…' : 'Upload file'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg"
          className="hidden"
          onChange={handleUpload}
        />
        <span className="text-xs text-slate-500">PDF, DOCX, TXT, images</span>
      </div>

      {uploadError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{uploadError}</p>
      )}

      {/* List */}
      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}

      {!isLoading && data?.results.length === 0 && (
        <div className="text-center py-10 text-slate-500 text-sm border border-dashed border-white/[0.06] rounded-xl">
          No files uploaded yet
        </div>
      )}

      <div className="space-y-2">
        {data?.results.map(att => (
          <div key={att.id}
            className="flex items-center justify-between px-4 py-3 bg-[#1a1a2e] border border-white/[0.06] rounded-lg">
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="h-5 w-5 text-slate-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-100 truncate">{att.original_name}</p>
                <p className="text-xs text-slate-500">
                  {formatBytes(att.file_size)} · {att.uploaded_by_name} · {new Date(att.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-4">
              <Button size="sm" variant="ghost" onClick={() => handleDownload(att)}>
                <Download className="h-4 w-4" />
              </Button>
              {canDelete && (
                <Button
                  size="sm" variant="ghost"
                  className="text-red-500 hover:text-red-700"
                  disabled={destroy.isPending}
                  onClick={() => destroy.mutate(att.id)}
                >
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
  const [tab, setTab] = useState<'overview' | 'attachments'>('overview')

  const { data: candidate, isLoading, isError } = useQuery<Candidate>({
    queryKey: ['candidate', id],
    queryFn: () => api.get(`/candidates/${id}/`).then(r => r.data),
    enabled: !!id,
  })

  const [cvDownloading, setCvDownloading] = useState<'pdf' | 'docx' | null>(null)

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

  if (isLoading) {
    return <div className="text-sm text-slate-500 py-10 text-center">Loading…</div>
  }

  if (isError || !candidate) {
    return <div className="text-sm text-red-500 py-10 text-center">Candidate not found.</div>
  }

  return (
    <div className="space-y-6">

      {/* Back + header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/candidates')} className="mt-0.5">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <InitialsAvatar id={candidate.id} firstName={candidate.first_name} lastName={candidate.last_name} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-slate-100">
              {candidate.first_name} {candidate.last_name}
            </h1>
            <StatusBadge status={candidate.status} />
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            {candidate.current_title || 'No title'}
            {candidate.current_company && ` · ${candidate.current_company}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" className="gap-1.5"
            disabled={cvDownloading !== null}
            onClick={() => downloadCV('pdf')}>
            {cvDownloading === 'pdf'
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <FileDown className="h-4 w-4" />}
            PDF
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5"
            disabled={cvDownloading !== null}
            onClick={() => downloadCV('docx')}>
            {cvDownloading === 'docx'
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <FileDown className="h-4 w-4" />}
            DOCX
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-white/[0.06]">
        <div className="flex gap-6">
          {(['overview', 'attachments'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                tab === t
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Contact */}
          <div className="bg-[#1a1a2e] border border-white/[0.06] rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Contact</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="text-slate-500 w-20 shrink-0">Email</dt>
                <dd className="text-slate-100 break-all">{candidate.email}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-slate-500 w-20 shrink-0">Phone</dt>
                <dd className="text-slate-100">{candidate.phone}</dd>
              </div>
              {candidate.location && (
                <div className="flex gap-2">
                  <dt className="text-slate-500 w-20 shrink-0">Location</dt>
                  <dd className="text-slate-100">{candidate.location}</dd>
                </div>
              )}
              {candidate.linkedin_url && (
                <div className="flex gap-2">
                  <dt className="text-slate-500 w-20 shrink-0">LinkedIn</dt>
                  <dd>
                    <a href={candidate.linkedin_url} target="_blank" rel="noreferrer"
                      className="text-blue-600 hover:underline break-all">
                      {candidate.linkedin_url}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Meta */}
          <div className="bg-[#1a1a2e] border border-white/[0.06] rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Details</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="text-slate-500 w-20 shrink-0">Source</dt>
                <dd className="text-slate-100 capitalize">{candidate.source.replace('_', ' ')}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-slate-500 w-20 shrink-0">Added</dt>
                <dd className="text-slate-100">{new Date(candidate.created_at).toLocaleDateString()}</dd>
              </div>
              {candidate.years_of_experience != null && (
                <div className="flex gap-2">
                  <dt className="text-slate-500 w-20 shrink-0">Experience</dt>
                  <dd className="text-slate-100">{candidate.years_of_experience} yr{candidate.years_of_experience !== 1 ? 's' : ''}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Skills */}
          {candidate.skills.length > 0 && (
            <div className="bg-[#1a1a2e] border border-white/[0.06] rounded-xl p-5 space-y-3 md:col-span-2">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Skills</h2>
              <div className="flex flex-wrap gap-2">
                {candidate.skills.map(s => (
                  <Badge key={s.id} variant="secondary">{s.name}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {candidate.notes && (
            <div className="bg-[#1a1a2e] border border-white/[0.06] rounded-xl p-5 space-y-3 md:col-span-2">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Notes</h2>
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{candidate.notes}</p>
            </div>
          )}
        </div>
      )}

      {tab === 'attachments' && <AttachmentsTab candidateId={Number(id)} />}
    </div>
  )
}
