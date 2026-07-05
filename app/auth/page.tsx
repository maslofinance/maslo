'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Mode = 'password' | 'magic' | 'setup'
type Status = 'idle' | 'loading' | 'sent' | 'error'

const inputStyle = {
  width: '100%',
  padding: '12px 16px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  color: '#f8f8ff',
  fontSize: 15,
  outline: 'none',
  boxSizing: 'border-box' as const,
}

export default function AuthPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [privacyAgreed, setPrivacyAgreed] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.push('/')
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (session) router.push('/')
    })
    return () => sub.subscription.unsubscribe()
  }, [router])

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')

    const fn = isSignUp
      ? supabase.auth.signUp({ email, password })
      : supabase.auth.signInWithPassword({ email, password })

    const { error } = await fn
    if (error) {
      setStatus('error')
      setErrorMsg(error.message)
    } else if (isSignUp) {
      setStatus('sent') // show "check email to confirm"
    }
    // on sign-in success the onAuthStateChange listener redirects
  }

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')
    const res = await fetch('/api/dev/set-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const d = await res.json()
    if (!res.ok) { setStatus('error'); setErrorMsg(d.error); return }
    // Now sign in with the new password
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setStatus('error'); setErrorMsg(error.message) }
    // success → onAuthStateChange redirects to /
  }

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth` : undefined },
    })
    if (error) { setStatus('error'); setErrorMsg(error.message) }
    else setStatus('sent')
  }

  const reset = () => { setStatus('idle'); setErrorMsg(''); setPassword('') }

  return (
    <div style={{
      minHeight: '100vh', background: '#07071a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px', fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 44, height: 44, background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
              borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 800, color: 'white', boxShadow: '0 0 24px rgba(124,58,237,0.4)',
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
        <div style={{ background: '#0d0d24', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, padding: '36px 32px' }}>

          {status === 'sent' ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>{isSignUp ? '✉️' : '📬'}</div>
              <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#f8f8ff' }}>
                {isSignUp ? 'Confirm your email' : 'Check your inbox'}
              </h2>
              <p style={{ margin: '0 0 24px', fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                {isSignUp
                  ? <>We sent a confirmation link to <strong style={{ color: '#c4b5fd' }}>{email}</strong>. Click it to activate your account.</>
                  : <>We sent a magic link to <strong style={{ color: '#c4b5fd' }}>{email}</strong>. Click it to sign in.</>
                }
              </p>
              <button onClick={reset} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', fontSize: 13, textDecoration: 'underline' }}>
                Go back
              </button>
            </div>
          ) : (
            <>
              <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: '#f8f8ff' }}>
                {isSignUp ? 'Create account' : 'Sign in to Maslo'}
              </h2>
              <p style={{ margin: '0 0 24px', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
                {mode === 'password'
                  ? isSignUp ? 'Pick an email and password.' : 'Use your email and password.'
                  : 'We\'ll email you a one-click sign-in link.'}
              </p>

              {/* Mode toggle */}
              <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 4, marginBottom: 24 }}>
                {([['password', '🔑 Password'], ['magic', '✉️ Magic Link'], ['setup', '⚙️ Set Password']] as [Mode, string][]).map(([m, label]) => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); reset() }}
                    style={{
                      flex: 1, padding: '8px', border: 'none', borderRadius: 8, cursor: 'pointer',
                      fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                      background: mode === m ? 'rgba(124,58,237,0.3)' : 'transparent',
                      color: mode === m ? '#c4b5fd' : 'rgba(255,255,255,0.35)',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <form onSubmit={mode === 'password' ? handlePassword : mode === 'setup' ? handleSetup : handleMagicLink}
                style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em', marginBottom: 8 }}>EMAIL</label>
                  <input
                    type="email" required value={email}
                    onChange={e => { setEmail(e.target.value); if (status === 'error') reset() }}
                    placeholder="you@example.com"
                    style={{ ...inputStyle, borderColor: status === 'error' ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)' }}
                  />
                </div>

                {(mode === 'password' || mode === 'setup') && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em', marginBottom: 8 }}>
                      {mode === 'setup' ? 'NEW PASSWORD' : 'PASSWORD'}
                    </label>
                    <input
                      type="password" required value={password} minLength={6}
                      onChange={e => { setPassword(e.target.value); if (status === 'error') reset() }}
                      placeholder="••••••••"
                      style={{ ...inputStyle, borderColor: status === 'error' ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)' }}
                    />
                  </div>
                )}

                {status === 'error' && (
                  <p style={{ margin: 0, fontSize: 12, color: '#f87171' }}>{errorMsg}</p>
                )}

                {/* Privacy checkbox — sign-up only */}
                {isSignUp && mode === 'password' && (
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={privacyAgreed}
                      onChange={e => setPrivacyAgreed(e.target.checked)}
                      style={{ marginTop: 2, accentColor: '#7c3aed', width: 15, height: 15, flexShrink: 0, cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
                      I have read and agree to the Maslo{' '}
                      <a
                        href="https://maslofinance.com/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#a78bfa', textDecoration: 'underline' }}
                        onClick={e => e.stopPropagation()}
                      >
                        Privacy Policy
                      </a>
                    </span>
                  </label>
                )}

                <button
                  type="submit" disabled={status === 'loading' || (isSignUp && mode === 'password' && !privacyAgreed)}
                  style={{
                    padding: '13px', border: 'none', borderRadius: 10,
                    background: (status === 'loading' || (isSignUp && mode === 'password' && !privacyAgreed))
                      ? 'rgba(124,58,237,0.3)'
                      : 'linear-gradient(135deg, #7c3aed, #5b21b6)',
                    color: (isSignUp && mode === 'password' && !privacyAgreed) ? 'rgba(255,255,255,0.35)' : 'white',
                    fontSize: 15, fontWeight: 700,
                    cursor: (status === 'loading' || (isSignUp && mode === 'password' && !privacyAgreed)) ? 'not-allowed' : 'pointer',
                    boxShadow: (status === 'loading' || (isSignUp && mode === 'password' && !privacyAgreed)) ? 'none' : '0 4px 20px rgba(124,58,237,0.35)',
                    transition: 'all 0.2s',
                  }}
                >
                  {status === 'loading'
                    ? 'Please wait…'
                    : mode === 'setup'
                      ? 'Set Password & Sign In'
                      : mode === 'password'
                        ? isSignUp ? 'Create Account' : 'Sign In'
                        : 'Send Magic Link'}
                </button>

                {mode === 'setup' && (
                  <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'center' }}>
                    Dev only — sets your password directly, no email needed.
                  </p>
                )}

                {mode === 'password' && (
                  <button
                    type="button"
                    onClick={() => { setIsSignUp(s => !s); setPrivacyAgreed(false); reset() }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', fontSize: 13, textDecoration: 'underline' }}
                  >
                    {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                  </button>
                )}
              </form>
            </>
          )}
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>
          The gastric bypass of financial banking apps.
        </p>

        <p style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.18)' }}>
          By continuing you agree to our{' '}
          <a
            href="https://maslofinance.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'rgba(167,139,250,0.5)', textDecoration: 'underline' }}
          >
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  )
}
