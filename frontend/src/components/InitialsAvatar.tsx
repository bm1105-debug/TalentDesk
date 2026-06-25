function nameHash(first: string, last: string): number {
  const s = (first + last).toLowerCase()
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff
  return h
}

const COLOURS = [
  { bg: 'bg-blue-600/20',  text: 'text-blue-200'  },
  { bg: 'bg-blue-500/20',  text: 'text-blue-300'  },
  { bg: 'bg-blue-400/20',  text: 'text-blue-200'  },
  { bg: 'bg-blue-700/20',  text: 'text-blue-300'  },
  { bg: 'bg-slate-500/20', text: 'text-slate-300' },
  { bg: 'bg-blue-500/15',  text: 'text-blue-400'  },
]

interface Props {
  id: number
  firstName: string
  lastName: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  style?: React.CSSProperties
}

export default function InitialsAvatar({ id: _id, firstName, lastName, size = 'md', style }: Props) {
  const colour    = COLOURS[nameHash(firstName, lastName) % COLOURS.length]
  const initials  = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
  const sizeClass = size === 'sm' ? 'h-7 w-7 text-xs'
                  : size === 'lg' ? 'h-12 w-12 text-lg'
                  : size === 'xl' ? 'h-16 w-16 text-xl'
                  : 'h-9 w-9 text-sm'
  return (
    <div
      className={`${colour.bg} ${colour.text} ${sizeClass} rounded-full flex items-center justify-center font-semibold shrink-0`}
      style={style}
    >
      {initials}
    </div>
  )
}
