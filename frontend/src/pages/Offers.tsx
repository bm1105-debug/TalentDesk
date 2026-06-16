// Offers page — filterable list of all offers with accept / decline / withdraw actions.
// "Make Offer" is triggered from the Submittals page; this page is read + action only.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, MinusCircle } from 'lucide-react'
import api from '@/api/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Offer {
  id: number
  submittal: number
  candidate_name: string
  job_title: string
  client_name: string
  salary: string
  currency: string
  offer_date: string
  expiry_date: string | null
  start_date: string | null
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn'
  notes: string
  created_by_name: string
  created_at: string
}

interface Paginated<T> { count: number; next: string | null; previous: string | null; results: T[] }

// ── Status helpers ─────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  pending:   'warning',
  accepted:  'success',
  declined:  'destructive',
  withdrawn: 'secondary',
}

function fmt(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtSalary(amount: string, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(amount))
}

// ── Action confirmation dialog ─────────────────────────────────────────────────

const actionSchema = z.object({ notes: z.string().optional() })
type ActionForm = z.infer<typeof actionSchema>

type OfferAction = 'accept' | 'decline' | 'withdraw'

const ACTION_LABELS: Record<OfferAction, { title: string; btn: string; btnClass: string }> = {
  accept:   { title: 'Accept Offer',    btn: 'Accept',   btnClass: 'bg-green-600 hover:bg-green-700 text-white' },
  decline:  { title: 'Decline Offer',   btn: 'Decline',  btnClass: 'bg-red-600 hover:bg-red-700 text-white' },
  withdraw: { title: 'Withdraw Offer',  btn: 'Withdraw', btnClass: 'bg-gray-600 hover:bg-gray-700 text-white' },
}

function OfferActionDialog({
  offer,
  action,
  open,
  onClose,
}: {
  offer: Offer
  action: OfferAction
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const cfg = ACTION_LABELS[action]

  const { register, handleSubmit, reset } = useForm<ActionForm>({ resolver: zodResolver(actionSchema) })

  const mutate = useMutation({
    mutationFn: (data: ActionForm) =>
      api.post(`/offers/${offer.id}/${action}/`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['offers'] })
      reset(); onClose()
    },
  })

  function handleClose() { reset(); onClose() }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{cfg.title}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(v => mutate.mutateAsync(v))} className="space-y-3">
          <p className="text-sm text-gray-600">
            <span className="font-medium">{offer.candidate_name}</span> — {offer.job_title}
            <span className="text-gray-400"> · {offer.client_name}</span>
          </p>
          <p className="text-sm text-gray-500">
            Salary: <span className="font-medium">{fmtSalary(offer.salary, offer.currency)}</span>
          </p>

          <div className="space-y-1">
            <Label>Notes <span className="text-gray-400 font-normal">(optional)</span></Label>
            <textarea
              {...register('notes')}
              rows={3}
              placeholder={
                action === 'accept'   ? 'Candidate confirmed start date…' :
                action === 'decline'  ? 'Reason for declining…' :
                'Reason for withdrawing…'
              }
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>

          {mutate.isError && (
            <p className="text-xs text-red-500">Action failed. Please try again.</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={mutate.isPending} className={cfg.btnClass}>
              {mutate.isPending ? 'Saving…' : cfg.btn}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Offers() {
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [actionState, setActionState] = useState<{ offer: Offer; action: OfferAction } | null>(null)

  const { data, isLoading } = useQuery<Paginated<Offer>>({
    queryKey: ['offers', statusFilter, page],
    queryFn: () =>
      api.get('/offers/', { params: { status: statusFilter || undefined, page } }).then(r => r.data),
    placeholderData: prev => prev,
  })

  const totalPages = data ? Math.ceil(data.count / 10) : 1

  return (
    <div className="space-y-4">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Offers</h1>
        <p className="text-sm text-gray-400">Create offers from the Submittals page</p>
      </div>

      {/* ── Filter ── */}
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="declined">Declined</option>
          <option value="withdrawn">Withdrawn</option>
        </select>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Candidate</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Job · Client</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Salary</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Offer Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Expiry</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Start Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            )}
            {!isLoading && data?.results.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No offers found</td></tr>
            )}
            {data?.results.map(o => (
              <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">{o.candidate_name}</td>
                <td className="px-4 py-3 text-gray-600">
                  <span className="font-medium">{o.job_title}</span>
                  <span className="text-gray-400"> · {o.client_name}</span>
                </td>
                <td className="px-4 py-3 text-gray-900 font-medium">
                  {fmtSalary(o.salary, o.currency)}
                </td>
                <td className="px-4 py-3 text-gray-600">{fmt(o.offer_date)}</td>
                <td className="px-4 py-3 text-gray-500">{fmt(o.expiry_date)}</td>
                <td className="px-4 py-3 text-gray-500">{fmt(o.start_date)}</td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[o.status] ?? 'secondary'}>{o.status}</Badge>
                </td>
                <td className="px-4 py-3">
                  {o.status === 'pending' && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setActionState({ offer: o, action: 'accept' })}
                        className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 font-medium px-1.5 py-1 rounded hover:bg-green-50"
                      >
                        <CheckCircle className="h-3.5 w-3.5" /> Accept
                      </button>
                      <button
                        onClick={() => setActionState({ offer: o, action: 'decline' })}
                        className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium px-1.5 py-1 rounded hover:bg-red-50"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Decline
                      </button>
                      <button
                        onClick={() => setActionState({ offer: o, action: 'withdraw' })}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 font-medium px-1.5 py-1 rounded hover:bg-gray-100"
                      >
                        <MinusCircle className="h-3.5 w-3.5" /> Withdraw
                      </button>
                    </div>
                  )}
                  {o.status !== 'pending' && (
                    <span className="text-xs text-gray-400 capitalize">{o.status}</span>
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
          <span>{data.count} offers · page {page} of {totalPages}</span>
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

      {/* ── Action dialog ── */}
      {actionState && (
        <OfferActionDialog
          offer={actionState.offer}
          action={actionState.action}
          open={true}
          onClose={() => setActionState(null)}
        />
      )}

    </div>
  )
}
