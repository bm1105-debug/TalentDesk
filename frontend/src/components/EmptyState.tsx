import type { ElementType } from 'react'

interface EmptyStateProps {
  icon: ElementType
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10">
      <div className="rounded-2xl bg-blue-500/10 p-4">
        <Icon className="h-12 w-12 text-blue-400/60" aria-hidden="true" />
      </div>
      <p className="text-base font-medium text-slate-300">{title}</p>
      {description && (
        <p className="text-sm text-slate-500 max-w-xs text-center">{description}</p>
      )}
      {action}
    </div>
  )
}
