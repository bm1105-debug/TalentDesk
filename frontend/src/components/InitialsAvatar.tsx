const COLOURS = [
  'bg-blue-500',   'bg-purple-500', 'bg-green-600',  'bg-rose-500',
  'bg-amber-500',  'bg-teal-600',   'bg-indigo-500', 'bg-pink-500',
]

interface Props {
  id: number
  firstName: string
  lastName: string
  size?: 'sm' | 'md' | 'lg'
}

export default function InitialsAvatar({ id, firstName, lastName, size = 'md' }: Props) {
  const colour   = COLOURS[id % COLOURS.length]
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
  const sizeClass = size === 'sm' ? 'h-7 w-7 text-xs'
                  : size === 'lg' ? 'h-12 w-12 text-lg'
                  : 'h-9 w-9 text-sm'
  return (
    <div className={`${colour} ${sizeClass} rounded-full flex items-center justify-center text-white font-semibold shrink-0`}>
      {initials}
    </div>
  )
}
