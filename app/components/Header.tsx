// app/components/Header.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const active = pathname === href || (href !== '/' && pathname.startsWith(href))
  return (
    <Link
      href={href}
      style={{
        padding: '6px 10px',
        borderRadius: 8,
        textDecoration: 'none',
        fontWeight: 600,
        border: active ? '1px solid #ddd' : '1px solid transparent',
        opacity: active ? 1 : 0.8,
      }}
    >
      {children}
    </Link>
  )
}

export default function Header() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      const { data } = await supabase.auth.getSession()
      if (!cancelled) setEmail(data.session?.user.email ?? null)
    }
    init()

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user.email ?? null)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth')
  }

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        backdropFilter: 'blur(6px)',
        background: 'rgba(255,255,255,0.8)',
        borderBottom: '1px solid #eee',
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: '0 auto',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          fontFamily: 'ui-sans-serif, system-ui',
        }}
      >
        <nav style={{ display: 'flex', gap: 10 }}>
          <NavLink href="/auth">Auth</NavLink>
          <NavLink href="/notes">Notes</NavLink>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, opacity: 0.75 }}>
            {email ? `Signed in as ${email}` : 'Not signed in'}
          </span>
          {email ? (
            <button
              onClick={signOut}
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid #ddd',
                background: 'white',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Sign Out
            </button>
          ) : (
            <Link
              href="/auth"
              style={{
                padding: '6px 10px',
                borderRadius: 8,
                border: 'none',
                background: '#7c3aed',
                color: 'white',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
