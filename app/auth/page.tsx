// app/auth/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')
  const [message, setMessage] = useState('Checking session…')
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null)

  // Keep the UI in sync with session state
  useEffect(() => {
    let cancelled = false

    const check = async () => {
      const { data, error } = await supabase.auth.getSession()
      if (cancelled) return
      if (error) {
        setMessage(`Auth check error: ${error.message}`)
        return
      }
      const em = data.session?.user.email ?? null
      setSignedInEmail(em)
      setMessage(em ? `Signed in as ${em}` : 'Not signed in')
    }
    check()

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      const em = session?.user.email ?? null
      setSignedInEmail(em)
      setMessage(em ? `Signed in as ${em}` : 'Not signed in')
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const sendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setMessage('Sending magic link…')

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Simple flow: after clicking email, land back on /auth
        emailRedirectTo:
          typeof window !== 'undefined'
            ? `${window.location.origin}/auth`
            : undefined,
      },
    })

    if (error) {
      setStatus('error')
      setMessage(error.message)
      return
    }
    setStatus('sent')
    setMessage('Magic link sent! Check your inbox.')
  }

  const signOut = async () => {
    setStatus('loading')
    const { error } = await supabase.auth.signOut()
    if (error) {
      setStatus('error')
      setMessage(error.message)
      return
    }
    setSignedInEmail(null)
    setStatus('idle')
    setMessage('Signed out')
  }

  return (
    <main style={{ maxWidth: 440, margin: '48px auto', fontFamily: 'ui-sans-serif, system-ui' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Auth</h1>
      <p style={{ marginBottom: 16, opacity: 0.85 }}>{message}</p>

      <form onSubmit={sendMagicLink} style={{ display: 'grid', gap: 12 }}>
        <label htmlFor="email" style={{ fontWeight: 600 }}>Email</label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (status !== 'idle') setStatus('idle')
          }}
          placeholder="you@example.com"
          style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 16 }}
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: 'none',
            background: '#7c3aed',
            color: 'white',
            fontSize: 16,
            fontWeight: 600,
            cursor: 'pointer',
            opacity: status === 'loading' ? 0.7 : 1
          }}
        >
          {status === 'loading' ? 'Sending…' : 'Send Magic Link'}
        </button>
      </form>

      <hr style={{ margin: '24px 0' }} />

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={signOut}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #ddd',
            background: 'white',
            fontSize: 16,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Sign Out
        </button>
        {signedInEmail && (
          <button
            onClick={() => { window.location.href = '/notes' }}
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: 'none',
              background: '#10b981',
              color: 'white',
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Go to Notes
          </button>
        )}
      </div>
    </main>
  )
}
