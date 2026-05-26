'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // If already signed in, go straight to dashboard (which handles onboarding redirect)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.push('/')
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (session) router.push('/')
    })

    return () => sub.subscription.unsubscribe()
  }, [router])

  const sendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth` : undefined,
      },
    })

    if (error) {
      setStatus('error')
      setErrorMsg(error.message)
      return
    }
    setStatus('sent')
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#07071a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 12,
          }}>
            <div style={{
              width: 44, height: 44,
              background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
              borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 800, color: 'white',
              boxShadow: '0 0 24px rgba(124,58,237,0.4)',
            }}>M</div>
            <span style={{
              fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px',
              background: 'linear-gradient(135deg, #c4b5fd, #a78bfa)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>MASLO</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.06em' }}>
            FINANCIAL FITNESS
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: '#0d0d24',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 20,
          padding: '36px 32px',
        }}>
          {status === 'sent' ? (
            /* ── Sent state ── */
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>📬</div>
              <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#f8f8ff' }}>
                Check your inbox
              </h2>
              <p style={{ margin: '0 0 24px', fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                We sent a magic link to <strong style={{ color: '#c4b5fd' }}>{email}</strong>.
                Click it to sign in — no password needed.
              </p>
              <button
                onClick={() => { setStatus('idle'); setEmail('') }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.35)', fontSize: 13,
                  textDecoration: 'underline',
                }}
              >
                Use a different email
              </button>
            </div>
          ) : (
            /* ── Sign in form ── */
            <>
              <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: '#f8f8ff' }}>
                Sign in to Maslo
              </h2>
              <p style={{ margin: '0 0 28px', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
                Enter your email and we&apos;ll send a magic link.
              </p>

              <form onSubmit={sendMagicLink} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em', marginBottom: 8 }}>
                    EMAIL
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => { setEmail(e.target.value); if (status === 'error') setStatus('idle') }}
                    placeholder="you@example.com"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: 'rgba(255,255,255,0.05)',
                      border: `1px solid ${status === 'error' ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}`,
                      borderRadius: 10,
                      color: '#f8f8ff',
                      fontSize: 15,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  {status === 'error' && (
                    <p style={{ margin: '6px 0 0', fontSize: 12, color: '#f87171' }}>{errorMsg}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={status === 'loading'}
                  style={{
                    padding: '13px',
                    background: status === 'loading'
                      ? 'rgba(124,58,237,0.4)'
                      : 'linear-gradient(135deg, #7c3aed, #5b21b6)',
                    border: 'none',
                    borderRadius: 10,
                    color: 'white',
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: status === 'loading' ? 'wait' : 'pointer',
                    letterSpacing: '0.01em',
                    boxShadow: status === 'loading' ? 'none' : '0 4px 20px rgba(124,58,237,0.35)',
                    transition: 'all 0.2s',
                  }}
                >
                  {status === 'loading' ? 'Sending…' : 'Send Magic Link'}
                </button>
              </form>
            </>
          )}
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>
          The gastric bypass of financial banking apps.
        </p>
      </div>
    </div>
  )
}
