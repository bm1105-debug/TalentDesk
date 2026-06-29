// AI Email Generator — layout matches original email_generator exactly:
// 2-col grid (input | output), bulk results + history span full width below.

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sparkles, Download } from 'lucide-react'
import { Link } from 'react-router-dom'
import api from '@/api/client'
import { timeAgo } from '@/lib/time'
import { useAuth } from '@/context/AuthContext'

// ── Types ──────────────────────────────────────────────────────────────────────

interface BulkResult {
  recipient: string; subject: string; body: string; error: string | null
}
interface SingleResult { subject: string; body: string }
interface BulkState {
  total: number; done: number; results: BulkResult[]; isRunning: boolean
}
interface HistoryItem {
  id: number; mode: 'single' | 'bulk'; purpose: string; tone: string
  length: string; recipient: string; subject: string; body: string
  bulk_results: BulkResult[]; created_at: string
}

// ── Quick-start templates ──────────────────────────────────────────────────────

const QUICK_TEMPLATES = {
  interview: {
    purpose: 'Interview Scheduling',
    keypoints: 'Interview on Monday\n11 AM\nMicrosoft Teams link to follow',
    tone: 'Professional', length: 'Standard',
  },
  offer: {
    purpose: 'Offer Letter Follow-up',
    keypoints: 'Following up on offer letter sent last week\nRequest confirmation by Friday\nOpen to discuss terms',
    tone: 'Assertive', length: 'Concise',
  },
  client: {
    purpose: 'Client Status Update',
    keypoints: 'Project is on track\nMilestone 2 completed\nNext review scheduled for next week',
    tone: 'Formal', length: 'Standard',
  },
} as const

// ── Helpers ────────────────────────────────────────────────────────────────────

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function downloadAll(results: BulkResult[]) {
  const lines = results
    .filter(r => !r.error)
    .map(r => `To: ${r.recipient}\nSubject: ${r.subject}\n\n${r.body}`)
    .join('\n\n' + '='.repeat(60) + '\n\n')
  const blob = new Blob([lines], { type: 'text/plain' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = 'bulk-emails.txt'; a.click()
  URL.revokeObjectURL(url)
}

// Full-width green button (Copy Subject / Copy Email Body)
function CopyBtn({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button onClick={copy}
      className="w-full mt-2.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm transition-colors">
      {copied ? 'Copied!' : label}
    </button>
  )
}

// Small green button used inside bulk item cards
function CopySmall({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button onClick={copy}
      className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2.5 py-1 rounded-md transition-colors">
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

// ── AI Email Generator ─────────────────────────────────────────────────────────

function AIEmailGenerator() {
  const qc = useQueryClient()

  const [aiMode,     setAiMode]     = useState<'single' | 'bulk'>('single')
  const [purpose,    setPurpose]    = useState('')
  const [keypoints,  setKeypoints]  = useState('')
  const [recipient,  setRecipient]  = useState('')
  const [bulkText,   setBulkText]   = useState('')
  const [tone,       setTone]       = useState('Professional')
  const [length,     setLength]     = useState('Standard')
  const [refineText, setRefineText] = useState('')
  const [error,      setError]      = useState('')

  const [singleResult, setSingleResult] = useState<SingleResult | null>(null)
  const [lastEmail,    setLastEmail]    = useState<SingleResult | null>(null)
  const [bulkState,    setBulkState]    = useState<BulkState | null>(null)

  const isRunningBulk = bulkState?.isRunning ?? false

  function loadTemplate(name: keyof typeof QUICK_TEMPLATES) {
    const t = QUICK_TEMPLATES[name]
    setPurpose(t.purpose); setKeypoints(t.keypoints)
    setTone(t.tone); setLength(t.length)
    setSingleResult(null); setBulkState(null); setError('')
  }

  function switchMode(mode: 'single' | 'bulk') {
    setAiMode(mode); setSingleResult(null); setBulkState(null); setError('')
  }

  // ── Single generation ──
  const singleMutation = useMutation({
    mutationFn: (payload: object) =>
      api.post('/communications/ai-generate/', payload).then(r => r.data),
    onSuccess: (data: { subject?: string; body?: string }) => {
      const result = { subject: data.subject ?? '', body: data.body ?? '' }
      setSingleResult(result)
      setLastEmail(result)
      setRefineText('')
      setError('')
      qc.invalidateQueries({ queryKey: ['ai-email-history'] })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg ?? 'Generation failed. Try again.')
    },
  })

  function handleSingleGenerate(isRefine = false) {
    if (!purpose || !recipient || !keypoints) {
      setError('Please fill in all fields before generating.'); return
    }
    setError('')
    const base = { mode: 'single', purpose, keypoints, tone, length, recipient, save_history: true }
    if (isRefine && lastEmail) {
      singleMutation.mutate({
        ...base,
        refine_instruction: refineText,
        previous_email: `Subject: ${lastEmail.subject}\n\nEmail: ${lastEmail.body}`,
      })
    } else {
      singleMutation.mutate(base)
    }
  }

  // ── Bulk generation (sequential, per-recipient, 500ms delay) ──
  const bulkAbort = useRef(false)

  async function runBulkGeneration() {
    const lines = bulkText.split('\n').map(r => r.trim()).filter(Boolean)
    if (!purpose || !keypoints || !lines.length) {
      setError('Please fill in all fields before generating.'); return
    }
    setError('')
    bulkAbort.current = false
    setBulkState({ total: lines.length, done: 0, results: [], isRunning: true })

    const accumulated: BulkResult[] = []
    for (let i = 0; i < lines.length; i++) {
      if (bulkAbort.current) break
      try {
        const data = await api.post('/communications/ai-generate/', {
          mode: 'single', purpose, keypoints, tone, length,
          recipient: lines[i], save_history: false,
        }).then(r => r.data)
        accumulated.push({ recipient: lines[i], subject: data.subject ?? '', body: data.body ?? '', error: null })
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Generation failed'
        accumulated.push({ recipient: lines[i], subject: '', body: '', error: msg })
      }
      setBulkState({ total: lines.length, done: i + 1, results: [...accumulated], isRunning: i < lines.length - 1 })
      if (i < lines.length - 1) await new Promise(r => setTimeout(r, 500))
    }
    setBulkState(prev => prev ? { ...prev, isRunning: false } : null)
  }

  // ── History ──
  const { data: history } = useQuery<HistoryItem[]>({
    queryKey: ['ai-email-history'],
    queryFn:  () => api.get('/communications/ai-history/').then(r => r.data),
  })

  const clearHistory = useMutation({
    mutationFn: () => api.delete('/communications/ai-history/'),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['ai-email-history'] }),
  })

  function restoreFromHistory(item: HistoryItem) {
    if (item.mode === 'single') {
      setSingleResult({ subject: item.subject, body: item.body })
      setLastEmail({ subject: item.subject, body: item.body })
      setAiMode('single')
      setBulkState(null)
    }
  }

  const isGenerating  = singleMutation.isPending || isRunningBulk
  const progressPct   = bulkState ? Math.round((bulkState.done / bulkState.total) * 100) : 0

  const fieldCls  = "w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-white/[0.04] text-slate-100 placeholder:text-slate-600 text-sm focus:outline-none focus:border-blue-500 transition-colors"
  const selectCls = "w-full px-3 py-2 border border-white/[0.12] rounded-lg bg-[#0d1117] text-slate-100 text-sm focus:outline-none focus:border-blue-500 transition-colors"
  const labelCls  = "block text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5"
  const cardCls   = "rounded-xl border border-white/[0.07] bg-[#0d1117] p-6"
  const h2Cls     = "text-sm font-semibold text-slate-100 pb-3 mb-4 border-b border-white/[0.06]"

  return (
    <div className="max-w-[1400px] mx-auto">

      {/* Page header — matches original */}
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/[0.06]">
        <span className="text-2xl">✉</span>
        <h1 className="text-xl font-semibold text-slate-100">AI Email Generator</h1>
      </div>

      {/* 2-column grid: input card | output card */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Left: Input Form ── */}
        <div className={cardCls}>
          <h2 className={h2Cls}>Email Details</h2>

          {/* Mode toggle */}
          <div className="flex gap-2 mb-5">
            {(['single', 'bulk'] as const).map(m => (
              <button key={m} onClick={() => switchMode(m)}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  aiMode === m
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'border-white/[0.12] text-slate-400 hover:text-slate-200 bg-transparent'
                }`}>
                {m === 'single' ? 'Single Email' : 'Bulk Mode'}
              </button>
            ))}
          </div>

          {/* Quick-start template buttons */}
          <div className="flex flex-wrap gap-2 mb-5">
            {(Object.keys(QUICK_TEMPLATES) as Array<keyof typeof QUICK_TEMPLATES>).map(name => (
              <button key={name} onClick={() => loadTemplate(name)}
                className="px-3 py-1.5 rounded-full border border-blue-500/50 text-blue-400 text-xs hover:bg-blue-500 hover:text-white transition-colors">
                {QUICK_TEMPLATES[name].purpose}
              </button>
            ))}
          </div>

          {/* Email Purpose */}
          <div className="mb-4">
            <label className={labelCls}>Email Purpose</label>
            <input value={purpose} onChange={e => setPurpose(e.target.value)}
              placeholder="e.g. Interview Scheduling" className={fieldCls} />
          </div>

          {/* Recipient (single) / Recipients (bulk) */}
          {aiMode === 'single' ? (
            <div className="mb-4">
              <label className={labelCls}>Recipient Name &amp; Designation</label>
              <input value={recipient} onChange={e => setRecipient(e.target.value)}
                placeholder="e.g. Rahul Sharma, Senior Developer" className={fieldCls} />
            </div>
          ) : (
            <div className="mb-4">
              <label className={labelCls}>Recipients (one per line)</label>
              <textarea value={bulkText} onChange={e => setBulkText(e.target.value)}
                placeholder={"Arjun Mehta, Senior Developer\nRahul Sharma, Tech Lead\nPriya Nair, HR Manager"}
                style={{ minHeight: '100px' }}
                className={`${fieldCls} resize-y`} />
            </div>
          )}

          {/* Key Points */}
          <div className="mb-4">
            <label className={labelCls}>Key Points</label>
            <textarea value={keypoints} onChange={e => setKeypoints(e.target.value)}
              placeholder="e.g. Interview on Monday, 11 AM, Microsoft Teams link to follow"
              rows={3}
              className={`${fieldCls} resize-y`} />
          </div>

          {/* Tone + Length */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className={labelCls}>Tone</label>
              <select value={tone} onChange={e => setTone(e.target.value)} className={selectCls}>
                <option value="Professional" title="Warm but businesslike">Professional</option>
                <option value="Friendly"     title="Conversational and approachable">Friendly</option>
                <option value="Formal"       title="Corporate and polished, no contractions">Formal</option>
                <option value="Assertive"    title="Direct, confident, action-oriented">Assertive</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Length</label>
              <select value={length} onChange={e => setLength(e.target.value)} className={selectCls}>
                <option value="Standard">Standard</option>
                <option value="Concise">Concise</option>
                <option value="Detailed">Detailed</option>
              </select>
            </div>
          </div>

          {/* Error */}
          {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

          {/* Generate button */}
          <button
            onClick={() => aiMode === 'single' ? handleSingleGenerate(false) : runBulkGeneration()}
            disabled={isGenerating || !purpose}
            className="w-full py-3 mt-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg text-sm transition-colors flex items-center justify-center gap-2">
            {isGenerating ? (
              <>
                <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                {aiMode === 'single' ? 'Generate Email' : 'Generate All Emails'}
              </>
            )}
          </button>
        </div>

        {/* ── Right: Output panel (single mode only) ── */}
        {aiMode === 'single' && (
          <div className={cardCls}>
            <h2 className={h2Cls}>Generated Email</h2>

            {/* Subject line — hidden until generated */}
            {singleResult?.subject && (
              <div className="mb-4">
                <label className={labelCls}>Subject Line</label>
                <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-slate-200">
                  {singleResult.subject}
                </div>
                <CopyBtn text={singleResult.subject} label="Copy Subject" />
              </div>
            )}

            {/* Email body — placeholder until generated, spinner while loading */}
            <div style={{ marginTop: 0 }}>
              {singleMutation.isPending ? (
                <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] flex items-center justify-center" style={{ minHeight: '200px' }}>
                  <span className="h-8 w-8 rounded-full border-[3px] border-white/[0.12] border-t-blue-500 animate-spin" />
                </div>
              ) : singleResult?.body ? (
                <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-slate-200 whitespace-pre-wrap leading-relaxed" style={{ minHeight: '200px' }}>
                  {singleResult.body}
                </div>
              ) : (
                <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-sm text-slate-600 italic" style={{ minHeight: '200px' }}>
                  Generated email will appear here...
                </div>
              )}

              {singleResult?.body && (
                <>
                  <CopyBtn text={singleResult.body} label="Copy Email Body" />
                  <p className="text-[11px] text-slate-600 mt-1.5">{wordCount(singleResult.body)} words</p>
                </>
              )}
            </div>

            {/* Refine section — appears after first generation */}
            {singleResult && (
              <div className="mt-4 pt-4 border-t border-white/[0.06]">
                <label className={labelCls}>Refine Instruction</label>
                <input value={refineText} onChange={e => setRefineText(e.target.value)}
                  placeholder="e.g. make it shorter, add urgency"
                  className={fieldCls} />
                <button
                  onClick={() => handleSingleGenerate(true)}
                  disabled={isGenerating || !refineText.trim()}
                  className="w-full mt-2.5 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 font-semibold rounded-lg text-sm transition-colors">
                  Regenerate &amp; Refine
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Bulk results panel — spans both columns ── */}
        {aiMode === 'bulk' && bulkState && (
          <div className={`${cardCls} col-span-2`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-100">Bulk Results</h2>
              {!bulkState.isRunning && bulkState.results.length > 0 && (
                <button onClick={() => downloadAll(bulkState.results)}
                  className="flex items-center gap-1.5 text-xs text-red-400 border border-red-400/40 px-3 py-1.5 rounded-md hover:bg-red-500/10 transition-colors">
                  <Download className="h-3 w-3" /> Download All
                </button>
              )}
            </div>

            {/* Progress bar */}
            <div className="mb-4">
              <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-1.5">
                {bulkState.isRunning
                  ? `Generating ${bulkState.done + 1} of ${bulkState.total}...`
                  : `Done — ${bulkState.results.length} emails generated.`}
              </p>
            </div>

            {/* Per-recipient result cards */}
            <div className="space-y-3">
              {bulkState.results.map((item, i) => (
                <div key={i} className="rounded-lg border border-white/[0.06] p-4 hover:border-blue-500/40 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-slate-200">{item.recipient}</p>
                    {!item.error && (
                      <CopySmall text={`Subject: ${item.subject}\n\n${item.body}`} />
                    )}
                  </div>
                  {item.error ? (
                    <p className="text-xs text-red-400">{item.error}</p>
                  ) : (
                    <>
                      <p className="text-sm text-slate-400 pb-2 mb-2 border-b border-white/[0.05]">
                        {item.subject}
                      </p>
                      <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed" style={{ maxHeight: '150px', overflowY: 'auto' }}>
                        {item.body}
                      </p>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── History panel — spans both columns, hidden when empty ── */}
        {(history?.length ?? 0) > 0 && (
          <div className={`${cardCls} col-span-2`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-100">Recent Emails</h2>
              <button onClick={() => clearHistory.mutate()}
                className="text-xs text-red-400 border border-red-400/40 px-3 py-1.5 rounded-md hover:bg-red-500/10 transition-colors">
                Clear History
              </button>
            </div>
            <div className="space-y-2">
              {history?.map(item => (
                <button key={item.id} onClick={() => restoreFromHistory(item)}
                  className="w-full text-left rounded-lg border border-white/[0.06] bg-white/[0.02] hover:border-blue-500/40 px-4 py-3 transition-colors">
                  <p className="text-sm font-semibold text-slate-200">{item.purpose}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{timeAgo(item.created_at)}</p>
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Communications() {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return (
    <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
      <Sparkles className="h-10 w-10 text-blue-400/40" />
      <p className="text-lg font-semibold text-slate-300">Sign in to use the AI Email Generator</p>
      <p className="text-sm text-slate-500 max-w-xs">Create personalised emails for candidates and clients using Groq AI.</p>
      <Link
        to="/login"
        className="mt-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
      >
        Sign In
      </Link>
    </div>
  )
  return <AIEmailGenerator />
}
