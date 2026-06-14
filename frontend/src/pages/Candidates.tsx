// What this file does: paginated candidate list with search + status filter,
// plus an "Add Candidate" dialog form. Mutations invalidate the list cache
// so the table refreshes automatically after create.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Search, Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import api from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogTrigger, DialogContent,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

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
  status: string
  source: string
  skills: Skill[]
  created_at: string
}

interface PaginatedResponse {
  count: number
  next: string | null
  previous: string | null
  results: Candidate[]
}

// ── Zod schema for the add-candidate form ──────────────────────────────────────

const schema = z.object({
  first_name:      z.string().min(1, 'Required'),
  last_name:       z.string().min(1, 'Required'),
  email:           z.string().email('Invalid email'),
  phone:           z.string().min(1, 'Required'),
  current_title:   z.string().optional(),
  current_company: z.string().optional(),
  location:        z.string().optional(),
  status:          z.enum(['active', 'passive', 'placed', 'blacklisted']).default('active'),
  source:          z.enum(['referral', 'job_board', 'linkedin', 'direct', 'other']).default('other'),
  notes:           z.string().optional(),
  skill_names:     z.string().optional(),   // comma-separated, split before sending
})

type FormValues = z.infer<typeof schema>

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_VARIANTS: Record<string, 'success' | 'default' | 'secondary' | 'destructive' | 'warning'> = {
  active:      'success',
  passive:     'default',
  placed:      'secondary',
  blacklisted: 'destructive',
}

// ── Add Candidate Form ─────────────────────────────────────────────────────────

function AddCandidateForm({ onSuccess }: { onSuccess: () => void }) {
  const qc = useQueryClient()

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const create = useMutation({
    mutationFn: (payload: object) => api.post('/candidates/', payload).then(r => r.data),
    onSuccess: () => {
      // Invalidate so the list refetches with the new candidate included
      qc.invalidateQueries({ queryKey: ['candidates'] })
      reset()
      onSuccess()
    },
  })

  async function onSubmit(values: FormValues) {
    const { skill_names, ...rest } = values
    await create.mutateAsync({
      ...rest,
      // Split comma-separated skills into an array, remove empty strings
      skill_names: skill_names
        ? skill_names.split(',').map(s => s.trim()).filter(Boolean)
        : [],
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>First name *</Label>
          <Input {...register('first_name')} placeholder="Jane" />
          {errors.first_name && <p className="text-xs text-red-500">{errors.first_name.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Last name *</Label>
          <Input {...register('last_name')} placeholder="Doe" />
          {errors.last_name && <p className="text-xs text-red-500">{errors.last_name.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Email *</Label>
          <Input {...register('email')} type="email" placeholder="jane@example.com" />
          {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Phone *</Label>
          <Input {...register('phone')} placeholder="+44 7700 900000" />
          {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Current title</Label>
          <Input {...register('current_title')} placeholder="Senior Engineer" />
        </div>
        <div className="space-y-1">
          <Label>Current company</Label>
          <Input {...register('current_company')} placeholder="Acme Corp" />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Location</Label>
        <Input {...register('location')} placeholder="London, UK" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Status</Label>
          <select {...register('status')} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
            <option value="active">Active</option>
            <option value="passive">Passive</option>
            <option value="placed">Placed</option>
            <option value="blacklisted">Blacklisted</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Source</Label>
          <select {...register('source')} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
            <option value="referral">Referral</option>
            <option value="job_board">Job Board</option>
            <option value="linkedin">LinkedIn</option>
            <option value="direct">Direct</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <Label>Skills <span className="text-gray-400 font-normal">(comma-separated)</span></Label>
        <Input {...register('skill_names')} placeholder="python, django, react" />
      </div>

      <div className="space-y-1">
        <Label>Notes</Label>
        <textarea
          {...register('notes')}
          rows={3}
          placeholder="Any notes about this candidate…"
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {create.isError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          Failed to create candidate. Check for duplicate email/phone.
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={isSubmitting || create.isPending}>
          {create.isPending ? 'Saving…' : 'Add Candidate'}
        </Button>
      </div>
    </form>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Candidates() {
  const [search,    setSearch]    = useState('')
  const [status,    setStatus]    = useState('')
  const [page,      setPage]      = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ['candidates', search, status, page],
    queryFn:  () => api.get('/candidates/', {
      params: {
        search:  search || undefined,
        status:  status || undefined,
        page,
      },
    }).then(r => r.data),
    // Keep previous page data visible while next page loads
    placeholderData: prev => prev,
  })

  const totalPages = data ? Math.ceil(data.count / 10) : 1

  return (
    <div className="space-y-4">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Candidates</h1>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Candidate
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Candidate</DialogTitle>
            </DialogHeader>
            <AddCandidateForm onSuccess={() => setDialogOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Filters ── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            className="pl-8"
            placeholder="Search name, email, title…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>

        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="passive">Passive</option>
          <option value="placed">Placed</option>
          <option value="blacklisted">Blacklisted</option>
        </select>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Title / Company</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Contact</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Skills</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading…</td>
              </tr>
            )}
            {!isLoading && data?.results.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">No candidates found</td>
              </tr>
            )}
            {data?.results.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {c.first_name} {c.last_name}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {c.current_title || '—'}
                  {c.current_company && <span className="text-gray-400"> · {c.current_company}</span>}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  <div>{c.email}</div>
                  <div className="text-gray-400">{c.phone}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {c.skills.slice(0, 3).map(s => (
                      <Badge key={s.id} variant="secondary">{s.name}</Badge>
                    ))}
                    {c.skills.length > 3 && (
                      <Badge variant="secondary">+{c.skills.length - 3}</Badge>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANTS[c.status] ?? 'secondary'}>{c.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {data && data.count > 10 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>{data.count} candidates · page {page} of {totalPages}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={!data.previous}
              onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={!data.next}
              onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

    </div>
  )
}
