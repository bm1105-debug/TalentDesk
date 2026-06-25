// What this file does: a small coloured pill used for status and priority labels.
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        default:     'bg-blue-500/20  text-blue-300',
        secondary:   'bg-white/10       text-slate-400',
        success:     'bg-blue-500/20 text-blue-300',
        warning:     'bg-amber-500/20   text-amber-300',
        destructive: 'bg-red-500/20     text-red-300',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
