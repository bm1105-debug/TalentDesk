import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '@/api/client'

interface Notification {
  id: number
  message: string
  candidate: number | null
  candidate_name: string | null
  is_read: boolean
  created_at: string
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const qc = useQueryClient()

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const { data: unread = { count: 0 } } = useQuery({
    queryKey: ['notifications-count'],
    queryFn: () => api.get('/notifications/unread-count/').then(r => r.data),
    refetchInterval: 30000,
  })

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications/').then(r => r.data),
    enabled: open,
  })

  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/mark-all-read/'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-count'] })
    },
  })

  const markOne = useMutation({
    mutationFn: (id: number) => api.patch(`/notifications/${id}/read/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
      qc.invalidateQueries({ queryKey: ['notifications-count'] })
    },
  })

  function handleClick(n: Notification) {
    if (!n.is_read) markOne.mutate(n.id)
    if (n.candidate) {
      navigate(`/candidates/${n.candidate}`)
      setOpen(false)
    }
  }

  return (
    <div ref={ref} className="relative">

      {/* ── Bell button ─────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Notifications"
        title="Notifications"
        className="relative p-2 rounded-lg transition-colors text-white/50 hover:text-white hover:bg-white/10"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unread.count > 0 && (
          <span
            className="absolute top-1 right-1 h-4 w-4 rounded-full text-white text-[10px] font-bold flex items-center justify-center"
            style={{ background: '#f43f5e', boxShadow: '0 0 6px #f43f5e' }}
          >
            {unread.count > 9 ? '9+' : unread.count}
          </span>
        )}
      </button>

      {/* ── Dropdown panel ──────────────────────────────────────────── */}
      {open && (
        <div
          className="absolute right-0 top-10 w-80 rounded-xl shadow-2xl z-50 overflow-hidden"
          style={{ background: 'var(--td-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {/* Header row */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <span className="text-sm font-semibold text-slate-200">Notifications</span>
            {unread.count > 0 && (
              <button
                onClick={() => markAll.mutate()}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-80 overflow-y-auto divide-y divide-white/[0.04]">
            {notifications.length === 0 && (
              <p className="px-4 py-6 text-sm text-slate-500 text-center">No notifications</p>
            )}
            {notifications.map(n => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`w-full text-left px-4 py-3 transition-colors block hover:bg-white/5 ${
                  !n.is_read ? 'bg-indigo-500/10' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  {!n.is_read && (
                    <span className="mt-1.5 h-2 w-2 rounded-full bg-indigo-400 flex-shrink-0" />
                  )}
                  <div className={!n.is_read ? '' : 'ml-4'}>
                    <p className="text-sm text-slate-200 leading-snug">{n.message}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{timeAgo(n.created_at)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
