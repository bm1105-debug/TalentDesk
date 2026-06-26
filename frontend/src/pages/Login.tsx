import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth, type AuthUser } from '@/context/AuthContext'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
})

type FormValues = z.infer<typeof schema>

const ROLE_LABELS: Record<string, string> = {
  recruiter:  'Recruiter',
  team_lead:  'Team Lead',
  vp:         'VP',
  ceo:        'CEO',
}

const ROLE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  recruiter:  { bg: 'rgba(37,99,235,0.15)',  text: '#93c5fd', border: 'rgba(37,99,235,0.30)' },
  team_lead:  { bg: 'rgba(139,92,246,0.15)', text: '#c4b5fd', border: 'rgba(139,92,246,0.30)' },
  vp:         { bg: 'rgba(16,185,129,0.15)', text: '#6ee7b7', border: 'rgba(16,185,129,0.30)' },
  ceo:        { bg: 'rgba(251,191,36,0.15)', text: '#fcd34d', border: 'rgba(251,191,36,0.30)' },
}

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [serverError, setServerError] = useState('')
  const [verifiedUser, setVerifiedUser] = useState<AuthUser | null>(null)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(values: FormValues) {
    setServerError('')
    try {
      const me = await login(values.username, values.password)
      setVerifiedUser(me)
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

        {verifiedUser ? (
          /* ── Role Confirmation Panel ── */
          <div className="space-y-5">
            <div style={{
              background: 'rgba(37,99,235,0.06)',
              border: '1px solid rgba(37,99,235,0.18)',
              borderRadius: '12px',
              padding: '18px',
              textAlign: 'center',
            }}>
              {/* Initials avatar */}
              <div style={{
                width: 52, height: 52, borderRadius: '50%', margin: '0 auto 12px',
                background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
                boxShadow: '0 4px 16px rgba(37,99,235,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '18px', fontWeight: 700, color: 'white',
              }}>
                {(verifiedUser.first_name?.[0] ?? verifiedUser.username[0]).toUpperCase()}
              </div>
              <p style={{ fontSize: '16px', fontWeight: 700, color: '#f1f5f9', marginBottom: '4px' }}>
                {verifiedUser.first_name && verifiedUser.last_name
                  ? `${verifiedUser.first_name} ${verifiedUser.last_name}`
                  : verifiedUser.username}
              </p>
              <p style={{ fontSize: '12px', color: 'rgba(148,163,184,0.7)', marginBottom: '12px' }}>
                @{verifiedUser.username}
              </p>
              {/* Role badge */}
              {(() => {
                const c = ROLE_COLORS[verifiedUser.role] ?? ROLE_COLORS.recruiter
                return (
                  <span style={{
                    display: 'inline-block',
                    background: c.bg, color: c.text,
                    border: `1px solid ${c.border}`,
                    borderRadius: '999px', padding: '3px 12px',
                    fontSize: '11px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                  }}>
                    {ROLE_LABELS[verifiedUser.role] ?? verifiedUser.role}
                  </span>
                )
              })()}
            </div>
            <p style={{ fontSize: '12px', color: 'rgba(148,163,184,0.6)', textAlign: 'center' }}>
              Is this you? Click continue to proceed.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setVerifiedUser(null)}
                style={{
                  flex: 1, padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: 500,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)',
                  color: '#94a3b8', cursor: 'pointer',
                }}
              >
                Not me
              </button>
              <button
                onClick={() => navigate('/dashboard', { replace: true })}
                style={{
                  flex: 2, padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                  background: 'linear-gradient(135deg, #1d4ed8, #2563eb)',
                  border: 'none', color: 'white', cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(37,99,235,0.40)',
                }}
              >
                Continue to Dashboard →
              </button>
            </div>
          </div>
        ) : (
          /* ── Login Form ── */
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
        )}
      </div>
    </div>
  )
}
