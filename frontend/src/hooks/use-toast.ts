import { useState, useEffect } from 'react'

export type ToastVariant = 'success' | 'error'

interface Toast {
  id: string
  message: string
  variant: ToastVariant
}

const DURATION_MS = 3500
let _toasts: Toast[] = []
const _listeners = new Set<(t: Toast[]) => void>()

function _dispatch(next: Toast[]) {
  _toasts = next
  _listeners.forEach(fn => fn([...next]))
}

export function toast(message: string, variant: ToastVariant = 'success') {
  const id = Math.random().toString(36).slice(2, 9)
  _dispatch([..._toasts, { id, message, variant }])
  setTimeout(() => _dispatch(_toasts.filter(t => t.id !== id)), DURATION_MS)
}

export function useToasts() {
  const [state, setState] = useState<Toast[]>([])
  useEffect(() => {
    _listeners.add(setState)
    return () => { _listeners.delete(setState) }
  }, [])
  return state
}
