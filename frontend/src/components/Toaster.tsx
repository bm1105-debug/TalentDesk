import { CheckCircle2, XCircle } from 'lucide-react'
import { useToasts } from '@/hooks/use-toast'

export function Toaster() {
  const toasts = useToasts()
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium shadow-xl ${
            t.variant === 'success'
              ? 'bg-[#1a1a2e] border-emerald-500/40 text-emerald-300'
              : 'bg-[#1a1a2e] border-red-500/40 text-red-300'
          }`}
        >
          {t.variant === 'success'
            ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            : <XCircle className="h-4 w-4 text-red-400 shrink-0" />}
          {t.message}
        </div>
      ))}
    </div>
  )
}
