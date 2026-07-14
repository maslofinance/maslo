'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import { supabase } from '@/lib/supabase'

let stripePromise: ReturnType<typeof loadStripe> | null = null
function getStripe() {
  if (!stripePromise) stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)
  return stripePromise
}

// ─── Types ──────────────────────────────────────────────────────────────────

type LockType = 'hard_lock' | 'soft_lock' | 'flexible'
type VaultCategory = 'essentials' | 'debt' | 'future' | 'lifestyle'

interface Vault {
  id: string
  name: string
  icon: string
  current_balance: number
  target_amount: number
  due_day: number | null
  lock_type: LockType
  category: VaultCategory
  description: string | null
}

interface Profile {
  email: string | null
  monthly_income: number | null
  budget_style: string | null
  notification_tone: string | null
}

interface BankAccount {
  current_balance: number | null
  available_balance: number | null
  name: string
  institution?: string
}

interface SectionMeta {
  key: VaultCategory
  label: string
  priority: number
  tagline: string
  color: string
}

const SECTION_META: SectionMeta[] = [
  { key: 'essentials', label: 'Essentials', priority: 1, tagline: 'Non-negotiable. Funded first.',         color: '#3b82f6' },
  { key: 'debt',       label: 'Debt',       priority: 2, tagline: 'Highest interest first. Kill the drain.', color: '#ef4444' },
  { key: 'future',     label: 'Future',     priority: 3, tagline: 'Building wealth. Not just surviving.',   color: '#8b5cf6' },
  { key: 'lifestyle',  label: 'Lifestyle',  priority: 4, tagline: 'Earned it. Spend guilt-free.',           color: '#10b981' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

function barColor(pct: number, key: string): string {
  if (key === 'lifestyle') {
    if (pct >= 0.6) return 'linear-gradient(90deg, #059669, #10b981)'
    if (pct >= 0.3) return 'linear-gradient(90deg, #d97706, #f59e0b)'
    return 'linear-gradient(90deg, #dc2626, #ef4444)'
  }
  if (pct >= 1)   return 'linear-gradient(90deg, #059669, #10b981)'
  if (pct >= 0.7) return 'linear-gradient(90deg, #0d9488, #34d399)'
  if (pct >= 0.4) return 'linear-gradient(90deg, #d97706, #f59e0b)'
  return 'linear-gradient(90deg, #dc2626, #ef4444)'
}

function getBadge(pct: number, key: string): { label: string; color: string } {
  if (key === 'lifestyle') {
    if (pct >= 0.6) return { label: 'Available',   color: '#10b981' }
    if (pct >= 0.3) return { label: 'Running Low', color: '#f59e0b' }
    return              { label: 'Almost Out',   color: '#ef4444' }
  }
  if (pct >= 1)   return { label: 'Funded ✓',     color: '#10b981' }
  if (pct >= 0.7) return { label: 'On Track',      color: '#34d399' }
  if (pct >= 0.4) return { label: 'Needs Funding', color: '#f59e0b' }
  return              { label: 'Underfunded',   color: '#ef4444' }
}

function ordinal(n: number) {
  const s = ['th','st','nd','rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// ─── Vault Row ───────────────────────────────────────────────────────────────

function VaultRow({ vault, meta, mounted }: { vault: Vault; meta: SectionMeta; mounted: boolean }) {
  const pct = vault.target_amount > 0 ? Math.min(vault.current_balance / vault.target_amount, 1) : 0
  const badge = getBadge(pct, meta.key)
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '14px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: hovered ? 'rgba(255,255,255,0.025)' : 'transparent',
        transition: 'background 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <div style={{
          width: 38, height: 38, flexShrink: 0,
          background: `${meta.color}18`, border: `1px solid ${meta.color}28`,
          borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
        }}>
          {vault.icon}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#f8f8ff' }}>{vault.name}</span>
            {vault.lock_type === 'hard_lock' && <span style={{ fontSize: 11, opacity: 0.3 }}>🔒</span>}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.32)', marginTop: 2 }}>
            {vault.due_day
              ? `Due ${ordinal(vault.due_day)} of month`
              : meta.key === 'lifestyle' ? 'Monthly budget' : 'Monthly target'}
          </div>
        </div>

        <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f8f8ff' }}>
            {fmt(vault.current_balance)}
            <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}> / {fmt(vault.target_amount)}</span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: badge.color, marginTop: 2 }}>
            {badge.label} · {Math.round(pct * 100)}%
          </div>
        </div>
      </div>

      <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: mounted ? `${Math.min(pct * 100, 100)}%` : '0%',
          background: barColor(pct, meta.key),
          borderRadius: 99,
          transition: 'width 1s cubic-bezier(0.34, 1.56, 0.64, 1)',
          boxShadow: pct >= 1 ? '0 0 8px rgba(16,185,129,0.4)' : undefined,
        }} />
      </div>
    </div>
  )
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ meta, vaults, mounted }: { meta: SectionMeta; vaults: Vault[]; mounted: boolean }) {
  const totalBal = vaults.reduce((s, v) => s + v.current_balance, 0)
  const totalTgt = vaults.reduce((s, v) => s + v.target_amount, 0)
  const overallPct = totalTgt > 0 ? Math.min(totalBal / totalTgt, 1) : 0

  return (
    <div style={{ background: '#0d0d24', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, overflow: 'hidden' }}>
      <div style={{
        padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: `linear-gradient(135deg, ${meta.color}0d 0%, transparent 60%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 22, height: 22, background: meta.color, borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 900, color: '#fff',
          }}>{meta.priority}</div>
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#f8f8ff' }}>{meta.label}</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', marginLeft: 8 }}>{meta.tagline}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right' as const }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.65)' }}>
            {fmt(totalBal)} / {fmt(totalTgt)}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: meta.color }}>
            {Math.round(overallPct * 100)}% funded
          </div>
        </div>
      </div>

      {vaults.length === 0 ? (
        <div style={{ padding: '20px', fontSize: 13, color: 'rgba(255,255,255,0.25)', textAlign: 'center' as const }}>
          No {meta.label.toLowerCase()} vaults set up.
        </div>
      ) : (
        vaults.map(v => <VaultRow key={v.id} vault={v} meta={meta} mounted={mounted} />)
      )}
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [checking, setChecking] = useState(true)
  const [resetting, setResetting] = useState(false)

  const [vaults, setVaults] = useState<Vault[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [fcAccounts, setFcAccounts] = useState<{ name: string; current_balance: number | null; available_balance: number | null }[]>([])
  const [userEmail, setUserEmail] = useState('')
  const [linkingMore, setLinkingMore] = useState(false)

  // ── Auth + data load ────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session
      if (!session) { router.push('/auth'); return }
      setUserEmail(session.user.email ?? '')

      const uid = session.user.id

      const [profileRes, vaultsRes, accountsRes, fcRes] = await Promise.all([
        supabase.from('profiles').select('email, monthly_income, budget_style, notification_tone, onboarding_complete, onboarding_step').eq('id', uid).single(),
        supabase.from('vaults').select('*').eq('user_id', uid).eq('is_active', true).order('priority'),
        supabase.from('bank_accounts').select('name, current_balance, available_balance').eq('user_id', uid).eq('is_active', true),
        (supabase as any).from('stripe_fc_accounts').select('name, current_balance, available_balance').eq('user_id', uid).eq('is_active', true),
      ])

      const p = profileRes.data
      if (!p?.onboarding_complete && (p?.onboarding_step ?? 0) < 9) {
        router.push('/onboarding'); return
      }

      setProfile(p)
      setVaults((vaultsRes.data ?? []) as Vault[])
      setBankAccounts((accountsRes.data ?? []) as BankAccount[])
      setFcAccounts(fcRes.data ?? [])
      setChecking(false)
    })
  }, [router])

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 120)
    return () => clearTimeout(t)
  }, [])

  // ── Reset ───────────────────────────────────────────────────────
  const handleReset = useCallback(async () => {
    if (!confirm('Reset all onboarding data? This deletes your vaults, bank links, and resets your profile.')) return
    setResetting(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const res = await fetch('/api/onboarding/reset', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!res.ok) { alert('Reset failed'); return }
      router.push('/onboarding')
    } catch { alert('Reset failed') }
    finally { setResetting(false) }
  }, [router])

  const handleLinkAnother = useCallback(async () => {
    setLinkingMore(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const uid = data.session?.user.id
      const res = await fetch('/api/stripe/financial-connections/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId: uid }),
      })
      const { client_secret, error: sessionError } = await res.json()
      if (sessionError) throw new Error(sessionError)
      const stripe = await getStripe()
      if (!stripe) throw new Error('Stripe failed to load')
      const result = await (stripe as any).collectFinancialConnectionsAccounts({ clientSecret: client_secret })
      if (result.error) throw new Error(result.error.message)
      if (!result.financialConnectionsSession?.accounts?.length) return
      const accountId = result.financialConnectionsSession.accounts[0].id
      await fetch('/api/stripe/financial-connections/save-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId: uid, accountId }),
      })
      // Refresh FC accounts
      const { data: fresh } = await (supabase as any).from('stripe_fc_accounts').select('name, current_balance, available_balance').eq('user_id', uid!).eq('is_active', true)
      setFcAccounts(fresh ?? [])
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to link account')
    } finally {
      setLinkingMore(false)
    }
  }, [])

  if (checking) return (
    <div style={{ minHeight: '100vh', background: '#07071a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, margin: '0 auto 16px', border: '3px solid rgba(124,58,237,0.2)', borderTop: '3px solid #7c3aed', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: 0 }}>Loading your vaults…</p>
      </div>
    </div>
  )

  // ── Computed stats ──────────────────────────────────────────────
  const allLinkedAccounts = [...bankAccounts, ...fcAccounts]
  const totalBalance = allLinkedAccounts.reduce((s, a) => s + (a.current_balance ?? 0), 0)
  const monthlyIncome = profile?.monthly_income ?? 0
  const vaultsByCategory = (cat: VaultCategory) => vaults.filter(v => v.category === cat)
  const debtVaults = vaultsByCategory('debt')
  const totalDebtTarget = debtVaults.reduce((s, v) => s + v.target_amount, 0)
  const allVaultsFunded = vaults.filter(v => v.category !== 'lifestyle').every(v => v.current_balance >= v.target_amount)
  const fundedCount = vaults.filter(v => v.current_balance >= v.target_amount).length
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()

  const totalLinked = allLinkedAccounts.length
  const institutionName = totalLinked > 0 ? `${totalLinked} account${totalLinked > 1 ? 's' : ''} linked` : 'No bank linked'

  return (
    <div style={{ minHeight: '100vh', background: '#07071a', paddingBottom: 80 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

        {/* ── Page header ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 36 }}>
          <div>
            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em' }}>
              {today}
            </p>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', color: '#f8f8ff' }}>
              {(() => { const h = new Date().getHours(); const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; const name = userEmail.split('@')[0]; const display = name.charAt(0).toUpperCase() + name.slice(1); return `${g}, ${display}.` })()}
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px',
              background: totalLinked ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${totalLinked ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 99,
            }}>
              <div style={{ width: 7, height: 7, background: totalLinked ? '#10b981' : 'rgba(255,255,255,0.3)', borderRadius: '50%', boxShadow: totalLinked ? '0 0 8px #10b981' : 'none' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: totalLinked ? '#6ee7b7' : 'rgba(255,255,255,0.4)' }}>
                {institutionName}
              </span>
            </div>
            <button
              onClick={handleLinkAnother} disabled={linkingMore}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.25)',
                borderRadius: 99, cursor: linkingMore ? 'wait' : 'pointer',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                color: linkingMore ? 'rgba(196,181,253,0.4)' : '#c4b5fd',
              }}
            >
              {linkingMore ? '⟳ Linking…' : '+ Link Account'}
            </button>
            <button
              onClick={handleReset} disabled={resetting}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.22)',
                borderRadius: 99, cursor: resetting ? 'wait' : 'pointer',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                color: resetting ? 'rgba(239,68,68,0.4)' : '#f87171',
              }}
            >
              {resetting ? '⟳ Resetting…' : '↺ Reset Onboarding'}
            </button>
          </div>
        </div>

        {/* ── Hero card ───────────────────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(135deg, #160930 0%, #0d0d26 60%)',
          border: '1px solid rgba(124,58,237,0.22)', borderRadius: 24,
          padding: '36px 40px', marginBottom: 20, position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -80, right: -80, width: 320, height: 320, background: 'radial-gradient(circle, rgba(124,58,237,0.18) 0%, transparent 65%)', pointerEvents: 'none' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 32, flexWrap: 'wrap' as const }}>
            <div>
              <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.09em' }}>
                TOTAL CASH BALANCE
              </p>
              <div style={{ fontSize: 48, fontWeight: 900, color: '#f8f8ff', letterSpacing: '-2px', lineHeight: 1 }}>
                {totalLinked > 0 ? fmt(totalBalance) : '—'}
              </div>
              {totalLinked === 0 && (
                <p style={{ margin: '8px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
                  Link a bank account to see your balance
                </p>
              )}
            </div>

            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' as const }}>
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.07em' }}>MONTHLY INCOME</p>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#10b981' }}>{monthlyIncome ? fmt(monthlyIncome) : '—'}</div>
              </div>
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.07em' }}>VAULTS FUNDED</p>
                <div style={{ fontSize: 24, fontWeight: 800, color: allVaultsFunded ? '#10b981' : '#f59e0b' }}>
                  {fundedCount} / {vaults.length}
                </div>
              </div>
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.07em' }}>DEBT TARGET</p>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#f8f8ff' }}>{totalDebtTarget ? fmt(totalDebtTarget) : '—'}</div>
              </div>
            </div>
          </div>

          {/* Learning mode banner */}
          <div style={{
            marginTop: 24, padding: '10px 16px',
            background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)',
            borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 14 }}>🎓</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
              <strong style={{ color: '#a78bfa' }}>Learning mode active.</strong> Maslo is watching and learning — no hard enforcement yet. Vaults will fill as income arrives.
            </span>
          </div>
        </div>

        {/* ── Main layout ─────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>

          {/* Vault sections */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {SECTION_META.map(meta => (
              <SectionCard
                key={meta.key}
                meta={meta}
                vaults={vaultsByCategory(meta.key)}
                mounted={mounted}
              />
            ))}
          </div>

          {/* Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Debt breakdown */}
            <div style={{ background: '#0d0d24', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f8f8ff', marginBottom: 2 }}>Debt Payoff</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Avalanche method — highest APR first</div>
              </div>
              {debtVaults.length === 0 ? (
                <div style={{ padding: 20, fontSize: 13, color: 'rgba(255,255,255,0.25)', textAlign: 'center' as const }}>No debt vaults. Nice. 🎉</div>
              ) : (
                debtVaults.map((v, i) => (
                  <div key={v.id} style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: i === 0 ? '#ef4444' : 'rgba(255,255,255,0.2)', boxShadow: i === 0 ? '0 0 6px #ef4444' : 'none' }} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#f8f8ff' }}>{v.name}</div>
                        {v.description && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{v.description}</div>}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: i === 0 ? '#ef4444' : 'rgba(255,255,255,0.5)' }}>
                      {fmt(v.target_amount)}/mo
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Transactions placeholder */}
            <div style={{ background: '#0d0d24', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f8f8ff' }}>Recent Transactions</div>
              </div>
              <div style={{ padding: '32px 20px', textAlign: 'center' as const }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>No transactions yet</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>They&apos;ll appear here as Maslo tracks your spending</div>
              </div>
            </div>

            {/* Profile summary */}
            <div style={{ background: '#0d0d24', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, padding: '16px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.07em', marginBottom: 12 }}>YOUR SETTINGS</div>
              {[
                ['Budget Style', profile?.budget_style ?? '—'],
                ['Tone', profile?.notification_tone ?? '—'],
                ['Vaults', `${vaults.length} active`],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#c4b5fd', textTransform: 'capitalize' as const }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
