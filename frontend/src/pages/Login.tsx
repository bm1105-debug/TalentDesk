import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/context/AuthContext'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const ROLES = [
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'team_lead', label: 'Team Lead' },
  { value: 'vp',        label: 'VP' },
  { value: 'ceo',       label: 'CEO' },
]

const schema = z.object({
  role:     z.string().min(1, 'Please select your role'),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
})

type FormValues = z.infer<typeof schema>

export default function Login() {
  const { login, logout } = useAuth()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState('')

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: '' },
  })

  async function onSubmit(values: FormValues) {
    setServerError('')
    try {
      const me = await login(values.username, values.password)
      if (me.role !== values.role) {
        logout()
        setServerError(`This account is registered as "${me.role.replace('_', ' ')}", not "${values.role.replace('_', ' ')}". Please select the correct role.`)
        return
      }
      navigate('/dashboard', { replace: true })
    } catch {
      setServerError('Invalid username or password.')
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: '#08080f' }}
    >
      {/* Ambient blue orb — top right */}
      <div className="absolute pointer-events-none" style={{
        top: '-120px', right: '-80px', width: '480px', height: '480px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(37,99,235,0.22) 0%, transparent 65%)',
      }} />
      {/* Ambient blue orb — bottom left */}
      <div className="absolute pointer-events-none" style={{
        bottom: '-100px', left: '-60px', width: '340px', height: '340px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 65%)',
      }} />
      {/* Sparkle decorations */}
      <span className="absolute pointer-events-none select-none" style={{ top: '18%', right: '22%', color: '#fbbf24', fontSize: '18px', opacity: 0.6 }}>✦</span>
      <span className="absolute pointer-events-none select-none" style={{ bottom: '22%', left: '18%', color: '#fbbf24', fontSize: '12px', opacity: 0.4 }}>✦</span>
      <span className="absolute pointer-events-none select-none" style={{ top: '55%', right: '12%', color: '#60a5fa', fontSize: '10px', opacity: 0.35 }}>✦</span>

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-sm"
        style={{
          background: 'rgba(13,17,23,0.90)',
          border: '1px solid rgba(37,99,235,0.20)',
          borderRadius: '18px',
          padding: '32px 28px',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.04), 0 24px 64px rgba(0,0,0,0.6), 0 0 40px rgba(37,99,235,0.10)',
          backdropFilter: 'blur(24px)',
        }}
      >
        {/* Logo */}
        <div className="mb-7">
          <div className="flex items-center gap-2 mb-5">
            <div style={{
              width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
              boxShadow: '0 4px 14px rgba(37,99,235,0.5)',
            }}>
              <svg viewBox="0 0 24 24" fill="none" width="18" height="18" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <span style={{ fontSize: '16px', fontWeight: 700, background: 'linear-gradient(135deg, #2563eb, #3b82f6, #60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              TalentDesk
            </span>
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#f1f5f9', letterSpacing: '-0.5px', marginBottom: '4px' }}>
            Welcome back
          </h1>
          <p style={{ fontSize: '13px', color: 'rgba(148,163,184,0.8)' }}>
            Sign in to your workspace
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Role dropdown */}
          <div className="space-y-1.5">
            <Label htmlFor="role" style={{ fontSize: '12px', fontWeight: 500, color: '#94a3b8' }}>Role</Label>
            <select
              id="role"
              {...register('role')}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: '8px', fontSize: '14px',
                background: '#0d1117', color: '#f1f5f9',
                border: '1px solid rgba(255,255,255,0.10)',
                outline: 'none', cursor: 'pointer',
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 12px center',
                paddingRight: '36px',
              }}
            >
              <option value="" disabled style={{ color: '#64748b' }}>Select your role…</option>
              {ROLES.map(r => (
                <option key={r.value} value={r.value} style={{ background: '#0d1117' }}>{r.label}</option>
              ))}
            </select>
            {errors.role && (
              <p className="text-xs text-red-400">{errors.role.message}</p>
            )}
          </div>

          {/* Username */}
          <div className="space-y-1.5">
            <Label htmlFor="username" style={{ fontSize: '12px', fontWeight: 500, color: '#94a3b8' }}>Username</Label>
            <Input
              id="username"
              placeholder="your.username"
              autoComplete="username"
              {...register('username')}
            />
            {errors.username && (
              <p className="text-xs text-red-400">{errors.username.message}</p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <Label htmlFor="password" style={{ fontSize: '12px', fontWeight: 500, color: '#94a3b8' }}>Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-xs text-red-400">{errors.password.message}</p>
            )}
          </div>

          {serverError && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {serverError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: '100%', marginTop: '8px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              background: isSubmitting ? 'rgba(37,99,235,0.5)' : 'linear-gradient(135deg, #1d4ed8, #2563eb)',
              color: 'white', fontWeight: 600, fontSize: '14px',
              border: 'none', borderRadius: '12px', padding: '11px 20px',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              boxShadow: isSubmitting ? 'none' : '0 4px 20px rgba(37,99,235,0.45)',
              transition: 'all 0.2s ease',
            }}
          >
            {isSubmitting ? 'Signing in…' : <>Sign in <span style={{ fontSize: '16px', lineHeight: 1 }}>→</span></>}
          </button>
        </form>
      </div>
    </div>
  )
}
