// Merges Tailwind classes safely — used by every Shadcn component.
// clsx handles conditional classes; twMerge resolves Tailwind conflicts (e.g. p-2 + p-4 → p-4).
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
