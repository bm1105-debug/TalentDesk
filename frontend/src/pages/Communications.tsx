// What this file does: lists email templates and provides a "Send Email" dialog.
// The dialog loads the selected template's available_variables and renders one
// input per variable so the recruiter fills them in before sending.

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Mail, Send } from 'lucide-react'
import api from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// ── Types ──────────────────────────────────────────────────────────────────────

interface EmailTemplate {
  id: number
  name: string
  template_type: string
  subject: string
  body: string
  available_variables: string   // comma-separated e.g. "candidate_name, job_title"
  created_by: string
}

interface PaginatedTemplates {
  count: number; results: EmailTemplate[]
}

// ── Send Email Dialog ──────────────────────────────────────────────────────────

function SendEmailDialog({ template }: { template: EmailTemplate }) {
  const [open,     setOpen]     = useState(false)
  const [toEmail,  setToEmail]  = useState('')
  const [toName,   setToName]   = useState('')
  const [context,  setContext]  = useState<Record<string, string>>({})
  const [sent,     setSent]     = useState(false)

  // Parse the variable list from the template definition
  const variables = template.available_variables
    ? template.available_variables.split(',').map(v => v.trim()).filter(Boolean)
    : []

  const send = useMutation({
    mutationFn: () => api.post('/communications/send/', {
      template_id: template.id,
      to_email:    toEmail,
      to_name:     toName || undefined,
      context,
    }),
    onSuccess: () => setSent(true),
  })

  function handleClose(o: boolean) {
    setOpen(o)
    if (!o) { setToEmail(''); setToName(''); setContext({}); setSent(false) }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1.5 border border-white/[0.15] bg-white/[0.05] text-slate-200 hover:bg-white/[0.1] hover:border-white/[0.25] rounded-lg text-sm px-3 py-1.5 transition-colors shrink-0">
          <Send className="h-3.5 w-3.5" /> Use Template
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send Email — {template.name}</DialogTitle>
        </DialogHeader>

        {sent ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-2xl">✓</p>
            <p className="text-sm font-medium text-green-700">Email sent to {toEmail}</p>
            <Button variant="outline" size="sm" onClick={() => handleClose(false)}>Done</Button>
          </div>
        ) : (
          <div className="space-y-3">

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>To email *</Label>
                <Input value={toEmail} onChange={e => setToEmail(e.target.value)}
                  placeholder="candidate@example.com" type="email" />
              </div>
              <div className="space-y-1">
                <Label>To name</Label>
                <Input value={toName} onChange={e => setToName(e.target.value)}
                  placeholder="Jane Doe" />
              </div>
            </div>

            {variables.length > 0 && (
              <div className="space-y-2 border border-white/[0.06] rounded-lg p-3 bg-white/[0.02]">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  Template variables
                </p>
                {variables.map(v => (
                  <div key={v} className="space-y-1">
                    <Label className="text-xs">{v}</Label>
                    <Input
                      value={context[v] ?? ''}
                      onChange={e => setContext(prev => ({ ...prev, [v]: e.target.value }))}
                      placeholder={v}
                      className="h-8 text-xs"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Preview of what the subject will render to */}
            <div className="text-xs text-slate-500 bg-white/[0.02] rounded px-3 py-2">
              <span className="font-medium">Subject template: </span>{template.subject}
            </div>

            {send.isError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                Failed to send. Check the email address and try again.
              </p>
            )}

            <div className="flex justify-end pt-1">
              <Button disabled={!toEmail || send.isPending} onClick={() => send.mutate()}>
                {send.isPending ? 'Sending…' : 'Send Email'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Communications() {
  const { data, isLoading } = useQuery<PaginatedTemplates>({
    queryKey: ['email-templates'],
    queryFn:  () => api.get('/communications/templates/').then(r => r.data),
  })

  return (
    <div className="space-y-4">


      {isLoading && <p className="text-sm text-slate-500">Loading templates…</p>}

      {!isLoading && data?.results.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          <Mail className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No email templates yet.</p>
          <p className="text-xs mt-1">Ask an Account Manager to create templates.</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.results.map(t => (
          <div key={t.id} className="rounded-xl border border-white/[0.07] bg-[#1a1a2e] flex flex-col">
            <div className="px-4 pt-4 pb-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400 mb-1">
                {t.template_type.replace(/_/g, ' ')}
              </p>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-100">{t.name}</p>
                <SendEmailDialog template={t} />
              </div>
            </div>
            <div className="px-4 pb-4 space-y-1.5 flex-1">
              <p className="text-xs text-slate-400">
                <span className="font-medium text-slate-300">Subject:</span> {t.subject}
              </p>
              {t.available_variables && (
                <p className="text-xs text-slate-400">
                  Variables: {t.available_variables}
                </p>
              )}
              <p className="text-xs text-slate-600">Created by {t.created_by}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
