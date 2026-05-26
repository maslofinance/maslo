'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ─── Types ─────────────────────────────────────────────────────────────────

type LockType = 'hard' | 'soft' | 'flexible'
type TxStatus = 'approved' | 'warned' | 'denied' | 'income'

interface Vault {
  id: string
  name: string
  icon: string
  balance: number
  target: number
  dueDay?: number
  interestRate?: string
  lockType: LockType
}

interface VaultSection {
  key: string
  label: string
  priority: number
  tagline: string
  color: string
  vaults: Vault[]
}

interface Tx {
  id: string
  icon: string
  merchant: string
  amount: number
  vault: string
  status: TxStatus
  time: string
}

// ─── Mock Data ──────────────────────────────────────────────────────────────

const TOTAL_BALANCE = 12840
const SPEND_LEFT_TODAY = 127
const SPEND_DAILY_LIMIT = 300
const TOTAL_DEBT = 8420
const MONTHLY_DEBT_PAID = 970
const MONTHLY_DEBT_TARGET = 1550

const SECTIONS: VaultSection[] = [
  {
    key: 'essentials',
    label: 'Essentials',
    priority: 1,
    tagline: 'Non-negotiable. Funded first.',
    color: '#3b82f6',
    vaults: [
      { id: '1', name: 'Rent',      icon: '🏡', balance: 2000, target: 2000, dueDay: 1,  lockType: 'hard' },
      { id: '2', name: 'Groceries', icon: '🛒', balance: 280,  target: 400,              lockType: 'hard' },
      { id: '3', name: 'Utilities', icon: '⚡', balance: 120,  target: 150,  dueDay: 22, lockType: 'hard' },
      { id: '4', name: 'Insurance', icon: '🛡️', balance: 200,  target: 200,  dueDay: 15, lockType: 'hard' },
    ],
  },
  {
    key: 'debt',
    label: 'Debt',
    priority: 2,
    tagline: 'Highest interest first. Eliminating the drain.',
    color: '#ef4444',
    vaults: [
      { id: '5', name: 'Chase Sapphire', icon: '💳', balance: 340, target: 800, dueDay: 18, interestRate: '22.9%', lockType: 'hard' },
      { id: '6', name: 'Car Payment',    icon: '🚗', balance: 450, target: 450, dueDay: 15, interestRate: '4.9%',  lockType: 'hard' },
      { id: '7', name: 'Student Loan',   icon: '🎓', balance: 180, target: 300, dueDay: 20, interestRate: '6.8%',  lockType: 'soft' },
    ],
  },
  {
    key: 'future',
    label: 'Future',
    priority: 3,
    tagline: 'Building wealth. Not just surviving.',
    color: '#8b5cf6',
    vaults: [
      { id: '8', name: 'Emergency Fund', icon: '🛟', balance: 4800, target: 9000, lockType: 'soft' },
      { id: '9', name: 'Investments',    icon: '📈', balance: 300,  target: 500,  lockType: 'soft' },
    ],
  },
  {
    key: 'lifestyle',
    label: 'Lifestyle',
    priority: 4,
    tagline: 'Earned it. Spend guilt-free.',
    color: '#10b981',
    vaults: [
      { id: '10', name: 'Dining Out',    icon: '🍜', balance: 111, target: 200, lockType: 'flexible' },
      { id: '11', name: 'Shopping',      icon: '🛍️', balance: 88,  target: 150, lockType: 'flexible' },
      { id: '12', name: 'Entertainment', icon: '🎬', balance: 100, target: 100, lockType: 'flexible' },
    ],
  },
]

const TRANSACTIONS: Tx[] = [
  { id: 't1', icon: '☕', merchant: 'Starbucks',      amount: -6.75,   vault: 'Dining Out', status: 'approved', time: '2h ago' },
  { id: 't2', icon: '⛽', merchant: 'Shell Gas',       amount: -48.20,  vault: 'Essentials', status: 'approved', time: '5h ago' },
  { id: 't3', icon: '📦', merchant: 'Amazon',          amount: -127.99, vault: 'Shopping',   status: 'warned',   time: 'Yesterday' },
  { id: 't4', icon: '💰', merchant: 'Direct Deposit',  amount: 3200.00, vault: 'Income',     status: 'income',   time: 'Yesterday' },
  { id: 't5', icon: '🍕', merchant: "Domino's Pizza",  amount: -24.50,  vault: 'Dining Out', status: 'approved', time: '2 days ago' },
]

const DEBT_BREAKDOWN = [
  { name: 'Chase Sapphire', rate: '22.9%', amount: 4200, urgent: true },
  { name: 'Student Loan',   rate: '6.8%',  amount: 3120, urgent: false },
  { name: 'Car Loan',       rate: '4.9%',  amount: 1100, urgent: false },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const fmtFull = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(n))

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
  if (pct >= 1)   return { label: 'Funded ✓',      color: '#10b981' }
  if (pct >= 0.7) return { label: 'On Track',       color: '#34d399' }
  if (pct >= 0.4) return { label: 'Needs Funding',  color: '#f59e0b' }
  return              { label: 'Underfunded',    color: '#ef4444' }
}

// ─── Vault Row ──────────────────────────────────────────────────────────────

function VaultRow({ vault, sectionKey, sectionColor, mounted }: {
  vault: Vault
  sectionKey: string
  sectionColor: string
  mounted: boolean
}) {
  const pct = Math.min(vault.balance / vault.target, 1)
  const b = getBadge(pct, sectionKey)
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
          background: `${sectionColor}18`,
          border: `1px solid ${sectionColor}28`,
          borderRadius: 11,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 17,
        }}>
          {vault.icon}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#f8f8ff' }}>{vault.name}</span>
            {vault.interestRate && (
              <span style={{
                fontSize: 10, fontWeight: 700, color: '#ef4444',
                background: 'rgba(239,68,68,0.12)', padding: '1px 6px', borderRadius: 4,
              }}>
                {vault.interestRate} APR
              </span>
            )}
            {vault.lockType === 'hard' && (
              <span style={{ fontSize: 11, opacity: 0.28 }}>🔒</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.32)', marginTop: 2 }}>
            {vault.dueDay
              ? `Due June ${vault.dueDay}`
              : sectionKey === 'lifestyle' ? 'Monthly budget' : 'Monthly target'}
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f8f8ff' }}>
            {fmt(vault.balance)}
            <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}> / {fmt(vault.target)}</span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: b.color, marginTop: 2 }}>
            {b.label} &middot; {Math.round(pct * 100)}%
          </div>
        </div>
      </div>

      <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: mounted ? `${Math.min(pct * 100, 100)}%` : '0%',
          background: barColor(pct, sectionKey),
          borderRadius: 99,
          transition: 'width 1s cubic-bezier(0.34, 1.56, 0.64, 1)',
          boxShadow: pct >= 1 ? '0 0 8px rgba(16,185,129,0.4)' : undefined,
        }} />
      </div>
    </div>
  )
}

// ─── Vault Section Card ──────────────────────────────────────────────────────

function SectionCard({ section, mounted }: { section: VaultSection; mounted: boolean }) {
  const totalBal = section.vaults.reduce((s, v) => s + v.balance, 0)
  const totalTgt = section.vaults.reduce((s, v) => s + v.target, 0)
  const overallPct = Math.min(totalBal / totalTgt, 1)

  return (
    <div style={{
      background: '#0d0d24',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 18,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: `linear-gradient(135deg, ${section.color}0d 0%, transparent 60%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 22, height: 22,
            background: section.color,
            borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 900, color: '#fff',
          }}>
            {section.priority}
          </div>
          <div>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#f8f8ff' }}>{section.label}</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', marginLeft: 8 }}>
              {section.tagline}
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.65)' }}>
            {fmt(totalBal)} / {fmt(totalTgt)}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: section.color }}>
            {Math.round(overallPct * 100)}% funded
          </div>
        </div>
      </div>

      {section.vaults.map(vault => (
        <VaultRow
          key={vault.id}
          vault={vault}
          sectionKey={section.key}
          sectionColor={section.color}
          mounted={mounted}
        />
      ))}
    </div>
  )
}

// ─── Transaction Row ─────────────────────────────────────────────────────────

function TxRow({ tx, s }: {
  tx: Tx
  s: { label: string; color: string; bg: string }
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '13px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        display: 'flex', alignItems: 'center', gap: 12,
        background: hovered ? 'rgba(255,255,255,0.025)' : 'transparent',
        transition: 'background 0.15s',
      }}
    >
      <div style={{
        width: 36, height: 36, flexShrink: 0,
        background: 'rgba(255,255,255,0.06)',
        borderRadius: 10,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16,
      }}>
        {tx.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#f8f8ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {tx.merchant}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>{tx.vault} · {tx.time}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: tx.amount > 0 ? '#10b981' : '#f8f8ff', marginBottom: 3 }}>
          {tx.amount > 0 ? '+' : '-'}{fmtFull(tx.amount)}
        </div>
        <span style={{
          fontSize: 9, fontWeight: 800, letterSpacing: '0.04em',
          color: s.color, background: s.bg,
          padding: '2px 6px', borderRadius: 4,
        }}>
          {s.label}
        </span>
      </div>
    </div>
  )
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [checking, setChecking] = useState(true)

  // ── Gate: redirect to onboarding if not complete ─────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session
      if (!session) { router.push('/auth'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_complete')
        .eq('id', session.user.id)
        .single()

      if (!profile?.onboarding_complete) {
        router.push('/onboarding')
        return
      }
      setChecking(false)
    })
  }, [router])

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 120)
    return () => clearTimeout(t)
  }, [])

  const handleReset = useCallback(async () => {
    if (!confirm('Reset all onboarding data? This deletes your vaults, bank links, and resets your profile. You\'ll be sent back to the onboarding flow.')) return
    setResetting(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const res = await fetch('/api/onboarding/reset', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (!res.ok) {
        const d = await res.json()
        alert('Reset failed: ' + (d.error ?? 'Unknown error'))
        return
      }
      router.push('/onboarding')
    } catch {
      alert('Reset request failed — check console')
    } finally {
      setResetting(false)
    }
  }, [router])

  if (checking) return (
    <div style={{ minHeight: '100vh', background: '#07071a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 48, height: 48, margin: '0 auto 16px',
          border: '3px solid rgba(124,58,237,0.2)',
          borderTop: '3px solid #7c3aed',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: 0 }}>Loading…</p>
      </div>
    </div>
  )

  const spendPct   = SPEND_LEFT_TODAY / SPEND_DAILY_LIMIT
  const debtPct    = MONTHLY_DEBT_PAID / MONTHLY_DEBT_TARGET
  const allVaults  = SECTIONS.flatMap(s => s.vaults)
  const fundedCount = allVaults.filter(v => v.balance >= v.target).length

  const statusMap: Record<TxStatus, { label: string; color: string; bg: string }> = {
    approved: { label: '✓ APPROVED', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
    warned:   { label: '⚠ WARNED',   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
    denied:   { label: '✕ DENIED',   color: '#ef4444', bg: 'rgba(239,68,68,0.1)'  },
    income:   { label: '↓ INCOME',   color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  }

  return (
    <div style={{ minHeight: '100vh', background: '#07071a', paddingBottom: 80 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>

        {/* ── Page title ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 36 }}>
          <div>
            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em' }}>
              THURSDAY, MAY 22, 2026
            </p>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', color: '#f8f8ff' }}>
              Good morning, Malcolm.
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Sync status pill */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 16px',
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.2)',
              borderRadius: 99,
            }}>
              <div style={{
                width: 7, height: 7, background: '#10b981', borderRadius: '50%',
                boxShadow: '0 0 8px #10b981',
              }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#6ee7b7' }}>
                Synced · Chase &amp; Bluevine
              </span>
            </div>

            {/* Dev: Reset Onboarding */}
            <button
              onClick={handleReset}
              disabled={resetting}
              title="Reset all onboarding data and re-run setup"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px',
                background: 'rgba(239,68,68,0.07)',
                border: '1px solid rgba(239,68,68,0.22)',
                borderRadius: 99,
                cursor: resetting ? 'wait' : 'pointer',
                transition: 'all 0.15s',
                fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                color: resetting ? 'rgba(239,68,68,0.4)' : '#f87171',
              }}
            >
              {resetting ? '⟳ Resetting…' : '↺ Reset Onboarding'}
            </button>
          </div>
        </div>

        {/* ── Hero: Balance + Spend Left Today ────────────────────────── */}
        <div style={{
          background: 'linear-gradient(135deg, #160930 0%, #0d0d26 60%)',
          border: '1px solid rgba(124,58,237,0.22)',
          borderRadius: 24,
          padding: '36px 40px',
          marginBottom: 20,
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: -80, right: -80,
            width: 320, height: 320,
            background: 'radial-gradient(circle, rgba(124,58,237,0.18) 0%, transparent 65%)',
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', bottom: -60, left: 220,
            width: 200, height: 200,
            background: 'radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 32, flexWrap: 'wrap' }}>
            {/* Balance */}
            <div>
              <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.09em' }}>
                TOTAL CASH BALANCE
              </p>
              <div style={{
                fontSize: 60, fontWeight: 900, letterSpacing: '-3px', lineHeight: 1,
                background: 'linear-gradient(135deg, #ffffff 0%, #c4b5fd 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                marginBottom: 14,
              }}>
                {fmt(TOTAL_BALANCE)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 13, fontWeight: 700, color: '#10b981',
                  background: 'rgba(16,185,129,0.12)',
                  padding: '3px 10px', borderRadius: 6,
                }}>
                  ↑ +$3,200
                </span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)' }}>
                  from paycheck · May 20
                </span>
              </div>
            </div>

            {/* Spend Left Today */}
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 18,
              padding: '24px 28px',
              minWidth: 270,
            }}>
              <p style={{ margin: '0 0 14px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.09em' }}>
                SPEND LEFT TODAY
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
                <span style={{ fontSize: 36, fontWeight: 900, letterSpacing: '-1px', color: '#f8f8ff' }}>
                  {fmt(SPEND_LEFT_TODAY)}
                </span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', paddingBottom: 4 }}>
                  of {fmt(SPEND_DAILY_LIMIT)}
                </span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden', marginBottom: 12 }}>
                <div style={{
                  height: '100%',
                  width: mounted ? `${spendPct * 100}%` : '0%',
                  background: 'linear-gradient(90deg, #7c3aed, #a78bfa)',
                  borderRadius: 99,
                  transition: 'width 1s cubic-bezier(0.34, 1.56, 0.64, 1)',
                  boxShadow: '0 0 10px rgba(167,139,250,0.45)',
                }} />
              </div>
              <p style={{ margin: 0, fontSize: 11, color: '#f59e0b', fontWeight: 500 }}>
                ⚠&nbsp; Groceries vault is low — refill before the 25th
              </p>
            </div>
          </div>
        </div>

        {/* ── Stats Row ───────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'TOTAL DEBT',         value: fmt(TOTAL_DEBT),                                         sub: '~8 months to payoff',                            subColor: '#ef4444', border: 'rgba(239,68,68,0.14)'   },
            { label: 'DEBT THIS MONTH',     value: `${fmt(MONTHLY_DEBT_PAID)} / ${fmt(MONTHLY_DEBT_TARGET)}`, sub: `${Math.round(debtPct * 100)}% of target`,        subColor: '#f59e0b', border: 'rgba(245,158,11,0.14)' },
            { label: 'SAVINGS RATE',        value: '18%',                                                   sub: 'of gross income',                                subColor: '#8b5cf6', border: 'rgba(139,92,246,0.14)' },
            { label: 'VAULTS FUNDED',       value: `${fundedCount} / ${allVaults.length}`,                  sub: 'this month',                                     subColor: '#10b981', border: 'rgba(16,185,129,0.14)'  },
          ].map(stat => (
            <div key={stat.label} style={{
              background: '#0d0d24',
              border: `1px solid ${stat.border}`,
              borderRadius: 16,
              padding: '20px',
            }}>
              <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.32)', letterSpacing: '0.08em' }}>
                {stat.label}
              </p>
              <p style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: '#f8f8ff', letterSpacing: '-0.3px' }}>
                {stat.value}
              </p>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: stat.subColor }}>
                {stat.sub}
              </p>
            </div>
          ))}
        </div>

        {/* ── Main Grid: Vaults + Sidebar ─────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>

          {/* Left: Vault sections */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {SECTIONS.map(section => (
              <SectionCard key={section.key} section={section} mounted={mounted} />
            ))}
          </div>

          {/* Right: Debt Meter + Transactions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Debt Meter */}
            <div style={{
              background: 'linear-gradient(160deg, #1c0808 0%, #0d0d24 100%)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 18,
              padding: '24px',
              position: 'relative',
              overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute', top: -50, right: -50,
                width: 180, height: 180,
                background: 'radial-gradient(circle, rgba(239,68,68,0.1) 0%, transparent 70%)',
                pointerEvents: 'none',
              }} />
              <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.09em' }}>
                DEBT ELIMINATION
              </p>
              <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-1px', color: '#f8f8ff', marginBottom: 4 }}>
                {fmt(TOTAL_DEBT)}
              </div>
              <p style={{ margin: '0 0 18px', fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>
                remaining · payoff in ~8 months
              </p>

              <div style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.42)' }}>This month</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#f8f8ff' }}>
                    {fmt(MONTHLY_DEBT_PAID)} / {fmt(MONTHLY_DEBT_TARGET)}
                  </span>
                </div>
                <div style={{ height: 7, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: mounted ? `${debtPct * 100}%` : '0%',
                    background: 'linear-gradient(90deg, #991b1b, #ef4444)',
                    borderRadius: 99,
                    transition: 'width 1s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    boxShadow: '0 0 10px rgba(239,68,68,0.3)',
                  }} />
                </div>
              </div>

              <div style={{ marginTop: 20 }}>
                <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.07em' }}>
                  BREAKDOWN
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {DEBT_BREAKDOWN.map(d => (
                    <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', fontWeight: 500 }}>{d.name}</span>
                        <span style={{
                          fontSize: 9, fontWeight: 800,
                          color: d.urgent ? '#ef4444' : '#f59e0b',
                          background: d.urgent ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                          padding: '1px 5px', borderRadius: 4,
                        }}>
                          {d.rate}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.62)' }}>
                        {fmt(d.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent Transactions */}
            <div style={{
              background: '#0d0d24',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 18,
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#f8f8ff' }}>Recent Transactions</span>
                <span style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600, cursor: 'pointer' }}>View all →</span>
              </div>
              {TRANSACTIONS.map(tx => (
                <TxRow key={tx.id} tx={tx} s={statusMap[tx.status]} />
              ))}
            </div>

          </div>
        </div>

      </div>
    </div>
  )
}
