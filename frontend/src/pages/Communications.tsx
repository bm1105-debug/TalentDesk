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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
        <Button size="sm" variant="outline" className="gap-1.5">
          <Send className="h-3.5 w-3.5" /> Use Template
        </Button>
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
              <div className="space-y-2 border rounded-lg p-3 bg-gray-50">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
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
            <div className="text-xs text-gray-400 bg-gray-50 rounded px-3 py-2">
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

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Communications</h1>
      </div>

      {isLoading && <p className="text-sm text-gray-400">Loading templates…</p>}

      {!isLoading && data?.results.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Mail className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No email templates yet.</p>
          <p className="text-xs mt-1">Ask an Account Manager to create templates.</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.results.map(t => (
          <Card key={t.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-sm font-semibold">{t.name}</CardTitle>
                  <p className="text-xs text-gray-400 mt-0.5 capitalize">
                    {t.template_type.replace('_', ' ')}
                  </p>
                </div>
                <SendEmailDialog template={t} />
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-gray-500">
                <span className="font-medium">Subject:</span> {t.subject}
              </p>
              {t.available_variables && (
                <p className="text-xs text-gray-400">
                  Variables: {t.available_variables}
                </p>
              )}
              <p className="text-xs text-gray-300">Created by {t.created_by}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
