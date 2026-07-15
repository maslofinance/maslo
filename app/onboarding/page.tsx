'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import { supabase } from '@/lib/supabase'
import { analyzeBankData, type BankPrefillResult } from '@/lib/bank-prefill'
import type { VaultInput, OnboardingPayload } from '@/app/api/vaults/create/route'

let stripePromise: ReturnType<typeof loadStripe> | null = null
function getStripe() {
  if (!stripePromise) stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)
  return stripePromise
}

// ─── Types ────────────────────────────────────────────────────────────────────
type EmploymentType = 'w2' | '1099' | 'business_owner'
type Personality    = 'drill_sergeant' | 'shaman' | 'coach'
type Freq           = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'

// ─── Style constants ──────────────────────────────────────────────────────────
const S = {
  page:  { minHeight: '100vh', background: '#07071a', color: '#f8f8ff', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif', WebkitFontSmoothing: 'antialiased' as const },
  card:  { background: '#0d0d24', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20 },
  label: { fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', display: 'block' as const, marginBottom: 6 },
  input: { width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#f8f8ff', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const },
  btn:   { padding: '16px 28px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', width: '100%', letterSpacing: '-0.2px' },
  skip:  { padding: '14px 24px', borderRadius: 10, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.35)', fontSize: 14, fontWeight: 500, cursor: 'pointer', width: '100%', marginTop: 8 },
}

const LOADING_MESSAGES = [
  'Connecting to your bank...',
  'Pulling your transaction history...',
  'Looking for patterns...',
  'Detecting recurring bills...',
  'Finding your income...',
  'Almost there...',
]

// ─── Spinner ──────────────────────────────────────────────────────────────────
function Spinner({ message }: { message: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', padding: '64px 0' }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        border: '3px solid rgba(124,58,237,0.2)',
        borderTop: '3px solid #7c3aed',
        animation: 'spin 1s linear infinite',
        marginBottom: 28,
      }} />
      <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', margin: 0, textAlign: 'center' as const, lineHeight: 1.6 }}>
        {message}
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── Confidence badge ─────────────────────────────────────────────────────────
function Badge({ confidence }: { confidence: 'high' | 'medium' }) {
  const isHigh = confidence === 'high'
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 4, letterSpacing: '0.05em',
      background: isHigh ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
      color: isHigh ? '#10b981' : '#f59e0b',
    }}>
      {isHigh ? '✓ CONFIRMED' : '~ ESTIMATED'}
    </span>
  )
}

// ─── Confirm card ─────────────────────────────────────────────────────────────
function ConfirmCard({
  icon, label, value, onChange, unit = '/mo', source, confidence, description,
}: {
  icon: string
  label: string
  value: string
  onChange: (v: string) => void
  unit?: string
  source?: string
  confidence?: 'high' | 'medium'
  description?: string
}) {
  return (
    <div style={{ ...S.card, padding: 20, marginBottom: 12, border: '1px solid rgba(124,58,237,0.2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.07em' }}>
          {icon} {label}
        </div>
        {confidence && <Badge confidence={confidence} />}
      </div>
      {description && (
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '0 0 12px', lineHeight: 1.5 }}>
          {description}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14 }}>$</span>
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ ...S.input, flex: 1 }}
        />
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' as const }}>{unit}</span>
      </div>
      {source && (
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 6 }}>{source}</div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter()

  const [userId, setUserId]           = useState<string | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [step, setStep]               = useState(1)
  const [error, setError]             = useState('')

  // Bank linking
  const [linking, setLinking]         = useState(false)
  const [analyzing, setAnalyzing]     = useState(false)
  const [spinMsg, setSpinMsg]         = useState(LOADING_MESSAGES[0])
  const spinIdx                       = useRef(0)

  // Analysis results + editable values
  const [findings, setFindings]       = useState<BankPrefillResult | null>(null)
  const [income, setIncome]           = useState('')
  const [incomeFreq, setIncomeFreq]   = useState<Freq>('weekly')
  const [rent, setRent]               = useState('')
  const [carEdits, setCarEdits]       = useState<string[]>([])
  const [utilEdits, setUtilEdits]     = useState<string[]>([])
  const [insEdits, setInsEdits]       = useState<string[]>([])

  // Optional linked accounts
  const [linkedSavingsId, setLinkedSavingsId] = useState<string | null>(null)
  const [linkingSavings, setLinkingSavings]   = useState(false)

  // Tax + personality — multi-select employment types
  const [employmentTypes, setEmploymentTypes] = useState<Set<EmploymentType>>(new Set(['w2']))
  const [personality, setPersonality]         = useState<Personality>('drill_sergeant')

  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.push('/auth'); return }
      setUserId(data.session.user.id)
      setAccessToken(data.session.access_token)
    })
  }, [router])

  const authHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }

  function startSpinner() {
    spinIdx.current = 0
    setSpinMsg(LOADING_MESSAGES[0])
    return setInterval(() => {
      spinIdx.current = (spinIdx.current + 1) % LOADING_MESSAGES.length
      setSpinMsg(LOADING_MESSAGES[spinIdx.current])
    }, 2200)
  }

  // ── Link primary checking ─────────────────────────────────────────────────────
  async function linkChecking() {
    setError('')
    setLinking(true)
    try {
      const res = await fetch('/api/stripe/financial-connections/session', {
        method: 'POST', headers: authHeaders, body: JSON.stringify({ userId }),
      })
      const { client_secret, error: sessionError } = await res.json()
      if (sessionError) throw new Error(sessionError)

      const stripe = await getStripe()
      if (!stripe) throw new Error('Stripe failed to load')

      const result = await (stripe as any).collectFinancialConnectionsAccounts({ clientSecret: client_secret })
      if (result.error) throw new Error(result.error.message)
      if (!result.financialConnectionsSession?.accounts?.length) throw new Error('No accounts linked. Please try again.')

      const accountId = result.financialConnectionsSession.accounts[0].id
      setLinking(false)
      setAnalyzing(true)
      const iv = startSpinner()

      try {
        const txRes  = await fetch(`/api/stripe/financial-connections/transactions?account_id=${accountId}`)
        const txData = await txRes.json()

        if (!txData.error && txData.transactions?.length) {
          const rawTxs = txData.transactions.map((tx: any) => ({
            id: tx.id, date: tx.date,
            amount: tx.amount / 100,
            description: tx.description ?? '',
            category: tx.category ?? undefined,
            subcategory: tx.subcategory ?? undefined,
          }))
          const found = analyzeBankData(rawTxs)
          setFindings(found)
          if (found.income) {
            // bank-prefill returns monthly equivalent in value — convert back to per-paycheck
            // so the confirm card shows "1,250 / weekly" and submit multiplies correctly
            const freqMult: Record<string, number> = { weekly: 52/12, biweekly: 26/12, semimonthly: 2, monthly: 1 }
            const perCheck = Math.round(parseFloat(found.income.value) / (freqMult[found.income.freq] ?? 1))
            setIncome(String(perCheck))
            setIncomeFreq(found.income.freq)
          }
          if (found.rent) setRent(found.rent.value)
          setCarEdits(found.cars.map(c => c.amount))
          setUtilEdits(found.utilities.map(u => u.amount))
          setInsEdits(found.insurances.map(i => i.amount))
        } else {
          setFindings({ utilities: [], insurances: [], cars: [], nudges: [] })
          setIncomeFreq('monthly')
        }

        const saveRes = await fetch('/api/stripe/financial-connections/save-account', {
          method: 'POST', headers: authHeaders, body: JSON.stringify({ userId, accountId }),
        })
        if (!saveRes.ok) {
          const saveData = await saveRes.json().catch(() => ({}))
          console.error('save-account failed:', saveData)
        }
      } finally {
        clearInterval(iv)
        setAnalyzing(false)
      }

      setStep(3)
    } catch (e: unknown) {
      setLinking(false)
      setAnalyzing(false)
      setError(e instanceof Error ? e.message : 'Bank link failed. Please try again.')
    }
  }

  // ── Link optional savings ─────────────────────────────────────────────────────
  async function linkSavings() {
    setError('')
    setLinkingSavings(true)
    try {
      const res = await fetch('/api/stripe/financial-connections/session', {
        method: 'POST', headers: authHeaders, body: JSON.stringify({ userId }),
      })
      const { client_secret, error: sessionError } = await res.json()
      if (sessionError) throw new Error(sessionError)
      const stripe  = await getStripe()
      const result  = await (stripe as any).collectFinancialConnectionsAccounts({ clientSecret: client_secret })
      if (result.error) throw new Error(result.error.message)
      const accountId = result.financialConnectionsSession?.accounts?.[0]?.id
      if (accountId) {
        setLinkedSavingsId(accountId)
        await fetch('/api/stripe/financial-connections/save-account', {
          method: 'POST', headers: authHeaders, body: JSON.stringify({ userId, accountId }),
        })
      }
      setStep(5) // → Tax question
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Link failed. You can skip this.')
    } finally {
      setLinkingSavings(false)
    }
  }

  // ── Submit: create vaults ─────────────────────────────────────────────────────
  async function submitOnboarding() {
    setSubmitting(true)
    setError('')
    setStep(7)

    try {
      const freqMult: Record<Freq, number> = { weekly: 52/12, biweekly: 26/12, semimonthly: 2, monthly: 1 }
      const perPaycheck    = parseFloat(income) || 0
      const monthlyIncome  = perPaycheck * freqMult[incomeFreq]

      // Tax rate: W-2 only = 0 (withheld), business_owner highest rate, 1099 next, combo = max
      const hasW2   = employmentTypes.has('w2')
      const has1099 = employmentTypes.has('1099')
      const hasBiz  = employmentTypes.has('business_owner')
      const taxRate = hasBiz ? 0.30 : has1099 ? 0.27 : hasW2 && (has1099 || hasBiz) ? 0.15 : 0
      const taxReserve = Math.round(monthlyIncome * taxRate)

      const vaults: VaultInput[] = []

      if (rent && parseFloat(rent) > 0)
        vaults.push({ name: 'Rent', icon: '🏡', category: 'essentials', target_amount: parseFloat(rent), due_day: 1, lock_type: 'hard_lock', allocation_fixed: parseFloat(rent) })

      const utilIcons: Record<string, string> = { 'Electric': '⚡', 'Water': '💧', 'Gas / Heat': '🔥', 'WiFi / Internet': '📶', 'Phone': '📱', 'Trash': '🗑️' }
      findings?.utilities.forEach((u, i) => {
        const amt = parseFloat(utilEdits[i] ?? u.amount)
        if (amt > 0) vaults.push({ name: u.type, icon: utilIcons[u.type] ?? '🔌', category: 'essentials', target_amount: amt, lock_type: 'hard_lock', allocation_fixed: amt })
      })

      findings?.insurances.forEach((ins, i) => {
        const amt = parseFloat(insEdits[i] ?? ins.amount)
        if (amt > 0) vaults.push({ name: `${ins.type} Insurance`, icon: '🛡️', category: 'essentials', target_amount: amt, lock_type: 'hard_lock', allocation_fixed: amt })
      })

      if (taxReserve > 0)
        vaults.push({ name: 'Tax Reserve', icon: '🧾', category: 'essentials', target_amount: taxReserve, lock_type: 'hard_lock', allocation_fixed: taxReserve })

      findings?.cars.forEach((car, i) => {
        const amt = parseFloat(carEdits[i] ?? car.amount)
        if (amt > 0) vaults.push({ name: `Car Payment${car.lender ? ` — ${car.lender}` : ''}`, icon: '🚗', category: 'debt', target_amount: amt, due_day: parseInt(car.due_day) || undefined, lock_type: 'hard_lock', lender_name: car.lender, allocation_fixed: amt })
      })

      // Emergency fund — 10% of remainder, capped at 3-month target timeline
      const essentialsDebt = vaults.reduce((s, v) => s + (v.allocation_fixed ?? 0), 0)
      const remainder      = Math.max(monthlyIncome - essentialsDebt, 0)
      const efTarget       = Math.round(essentialsDebt * 3)
      const efMonthly      = Math.min(Math.round(remainder * 0.1), Math.max(Math.round(efTarget / 12), 0))
      if (efMonthly > 0)
        vaults.push({ name: 'Emergency Fund', icon: '🛟', category: 'future', target_amount: efTarget, lock_type: 'soft_lock', allocation_fixed: efMonthly })

      // Fun Money — whatever's left
      const allocated = vaults.reduce((s, v) => s + (v.allocation_fixed ?? 0), 0)
      const funMoney  = Math.max(Math.round(monthlyIncome - allocated), 0)
      vaults.push({ name: 'Fun Money', icon: '🎉', category: 'lifestyle', target_amount: funMoney, lock_type: 'flexible' })

      const payload: OnboardingPayload = {
        vaults,
        monthly_income:   Math.round(monthlyIncome),
        income_frequency: incomeFreq,
        budget_style:     personality === 'drill_sergeant' ? 'aggressive' : personality === 'shaman' ? 'liberal' : 'moderate',
        notification_tone: personality === 'drill_sergeant' ? 'drill_sergeant' : personality === 'shaman' ? 'sarcastic' : 'gentle',
        onboarding_mode:  'hybrid',
      }

      const res  = await fetch('/api/vaults/create', { method: 'POST', headers: authHeaders, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      router.push('/')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Setup failed. Please try again.')
      setSubmitting(false)
      setStep(6) // back to personality so they can retry
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div style={S.page}>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '40px 20px 80px', display: 'flex', flexDirection: 'column' as const, minHeight: '100vh' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 48 }}>
          <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: '#fff' }}>M</div>
          <span style={{ fontSize: 15, fontWeight: 800, background: 'linear-gradient(135deg,#fff,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>MASLO</span>
        </div>

        {/* Error banner */}
        {error && step !== 6 && (
          <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#fca5a5', marginBottom: 20, lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        {/* ── STEP 1: WELCOME ────────────────────────────────────────────────── */}
        {step === 1 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, justifyContent: 'center' }}>
            <div style={{ marginBottom: 52 }}>
              <h1 style={{ fontSize: 40, fontWeight: 900, margin: '0 0 20px', letterSpacing: '-1.5px', lineHeight: 1.05 }}>
                Welcome to{' '}
                <span style={{ background: 'linear-gradient(135deg, #7c3aed, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Maslo.</span>
              </h1>
              <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.65, maxWidth: 380 }}>
                Let&apos;s get a clear picture of your financial fitness. This won&apos;t take long.
              </p>
            </div>
            <button onClick={() => setStep(2)} style={S.btn}>
              Get Started
            </button>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', textAlign: 'center' as const, marginTop: 20, lineHeight: 1.6 }}>
              Maslo reads your bank data securely and never stores your login credentials.
            </p>
          </div>
        )}

        {/* ── STEP 2: LINK CHECKING ──────────────────────────────────────────── */}
        {step === 2 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, justifyContent: 'center' }}>
            {analyzing ? (
              <Spinner message={spinMsg} />
            ) : (
              <>
                <div style={{ marginBottom: 36 }}>
                  <div style={{ fontSize: 44, marginBottom: 20 }}>🏦</div>
                  <h2 style={{ fontSize: 30, fontWeight: 900, margin: '0 0 14px', letterSpacing: '-0.8px' }}>
                    Connect your main checking account.
                  </h2>
                  <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.65 }}>
                    This is where Maslo does its best work. We&apos;ll analyze 180 days of real transactions and do the work for you.
                  </p>
                </div>

                <div style={{ ...S.card, padding: '14px 18px', marginBottom: 28, border: '1px solid rgba(124,58,237,0.2)' }}>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0, lineHeight: 1.6 }}>
                    🔒 Maslo uses <strong style={{ color: 'rgba(255,255,255,0.7)' }}>Stripe Financial Connections</strong> — trusted by millions of businesses worldwide. Read-only access. We never store your login credentials.
                  </p>
                </div>

                {error && (
                  <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#fca5a5', marginBottom: 20 }}>
                    {error}
                  </div>
                )}

                <button onClick={linkChecking} disabled={linking} style={{ ...S.btn, opacity: linking ? 0.6 : 1 }}>
                  {linking ? 'Opening secure connection...' : 'Connect Bank Account'}
                </button>
              </>
            )}
          </div>
        )}

        {/* ── STEP 3: THE REVEAL ─────────────────────────────────────────────── */}
        {step === 3 && findings && (
          <div>
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 36, marginBottom: 16 }}>✨</div>
              <h2 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 12px', letterSpacing: '-0.6px' }}>
                Here&apos;s what we found.
              </h2>
              <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.6 }}>
                Review what Maslo detected from your account. Edit anything — these numbers become your vaults.
              </p>
            </div>

            {!findings.income && !findings.rent && findings.cars.length === 0 && findings.utilities.length === 0 && findings.insurances.length === 0 && (
              <div style={{ ...S.card, padding: 24, marginBottom: 20, textAlign: 'center' as const }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🏦</div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#f8f8ff', margin: '0 0 8px' }}>
                  Your bank didn&apos;t share transaction data.
                </p>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0, lineHeight: 1.6 }}>
                  Some institutions (especially business banks) restrict access through Stripe. Enter your numbers manually — Maslo will build a picture from here and get smarter as you go.
                </p>
              </div>
            )}

            {/* Income */}
            {findings.income ? (
              (() => {
                const freqLabel: Record<string, string> = { weekly: 'weekly', biweekly: 'bi-weekly', semimonthly: '1st & 15th', monthly: 'monthly' }
                const mult: Record<Freq, number> = { weekly: 52/12, biweekly: 26/12, semimonthly: 2, monthly: 1 }
                const monthly = Math.round((parseFloat(income) || 0) * mult[incomeFreq])
                return (
                  <ConfirmCard
                    icon="💰" label="INCOME DETECTED"
                    value={income}
                    onChange={setIncome}
                    unit={`/ ${freqLabel[incomeFreq] ?? incomeFreq}`}
                    confidence={findings.income.confidence}
                    source={findings.income.source}
                    description={`We see $${Math.round(parseFloat(income || '0')).toLocaleString()} coming in ${freqLabel[incomeFreq] ?? incomeFreq}. Monthly equivalent: $${monthly.toLocaleString()}/mo`}
                  />
                )
              })()
            ) : (
              <div style={{ ...S.card, padding: 20, marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 12, letterSpacing: '0.07em' }}>💰 YOUR MONTHLY INCOME</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14 }}>$</span>
                  <input type="number" value={income} onChange={e => setIncome(e.target.value)} placeholder="Monthly take-home" style={{ ...S.input, flex: 1 }} />
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>/mo</span>
                </div>
              </div>
            )}

            {/* Rent */}
            {findings.rent ? (
              <ConfirmCard
                icon="🏡" label="RENT / MORTGAGE DETECTED"
                value={rent} onChange={setRent}
                confidence={findings.rent.confidence}
                source={findings.rent.source}
                description={`We noticed a recurring charge of $${Math.round(parseFloat(findings.rent.value)).toLocaleString()}/mo. Is this your rent or mortgage?`}
              />
            ) : (
              <div style={{ ...S.card, padding: 20, marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 12, letterSpacing: '0.07em' }}>🏡 RENT / MORTGAGE</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14 }}>$</span>
                  <input type="number" value={rent} onChange={e => setRent(e.target.value)} placeholder="Monthly amount" style={{ ...S.input, flex: 1 }} />
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>/mo</span>
                </div>
              </div>
            )}

            {/* Car payments */}
            {findings.cars.map((car, i) => (
              <ConfirmCard
                key={i}
                icon="🚗" label="CAR PAYMENT DETECTED"
                value={carEdits[i] ?? car.amount}
                onChange={v => setCarEdits(prev => { const n = [...prev]; n[i] = v; return n })}
                confidence={car.confidence}
                source={car.source}
                description={`We see $${Math.round(parseFloat(car.amount)).toLocaleString()}/mo going to ${car.lender}. Car payment?`}
              />
            ))}

            {/* Utilities */}
            {findings.utilities.map((u, i) => (
              <ConfirmCard
                key={i}
                icon="⚡" label={`${u.type.toUpperCase()} DETECTED`}
                value={utilEdits[i] ?? u.amount}
                onChange={v => setUtilEdits(prev => { const n = [...prev]; n[i] = v; return n })}
                confidence={u.confidence}
                source={u.source}
                description={`About $${Math.round(parseFloat(u.amount)).toLocaleString()}/mo for ${u.type}. Does that sound right?`}
              />
            ))}

            {/* Insurance */}
            {findings.insurances.map((ins, i) => (
              <ConfirmCard
                key={i}
                icon="🛡️" label={`${ins.type.toUpperCase()} INSURANCE DETECTED`}
                value={insEdits[i] ?? ins.amount}
                onChange={v => setInsEdits(prev => { const n = [...prev]; n[i] = v; return n })}
                confidence={ins.confidence}
                source={ins.source}
                description={`$${Math.round(parseFloat(ins.amount)).toLocaleString()}/mo for ${ins.type} insurance.`}
              />
            ))}

            {/* Nudges */}
            {findings.nudges.map((nudge, i) => (
              <div key={i} style={{ padding: '12px 16px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, fontSize: 13, color: '#f59e0b', marginBottom: 10, lineHeight: 1.5 }}>
                💬 {nudge}
              </div>
            ))}

            <button onClick={() => setStep(4)} style={{ ...S.btn, marginTop: 12 }}>
              {findings.income || findings.rent || findings.cars.length > 0 ? 'These look right →' : 'Continue →'}
            </button>
          </div>
        )}

        {/* ── STEP 4: SAVINGS (OPTIONAL) ─────────────────────────────────────── */}
        {step === 4 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, justifyContent: 'center' }}>
            {linkingSavings ? (
              <Spinner message="Connecting savings account..." />
            ) : linkedSavingsId ? (
              <>
                <div style={{ marginBottom: 40 }}>
                  <div style={{ fontSize: 44, marginBottom: 20 }}>✅</div>
                  <h2 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 12px', letterSpacing: '-0.6px' }}>Savings account linked.</h2>
                  <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', margin: 0 }}>Maslo now has a complete picture of your liquid assets.</p>
                </div>
                <button onClick={() => setStep(5)} style={S.btn}>Continue →</button>
              </>
            ) : (
              <>
                <div style={{ marginBottom: 40 }}>
                  <div style={{ fontSize: 44, marginBottom: 20 }}>🏦</div>
                  <h2 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 14px', letterSpacing: '-0.6px' }}>Got a savings account?</h2>
                  <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.65 }}>
                    Linking it gives Maslo a fuller picture of your financial fitness.
                  </p>
                </div>
                {error && (
                  <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#fca5a5', marginBottom: 16 }}>
                    {error}
                  </div>
                )}
                <button onClick={linkSavings} style={S.btn}>Link Savings Account</button>
                <button onClick={() => { setError(''); setStep(5) }} style={S.skip}>Skip for now</button>
              </>
            )}
          </div>
        )}

        {/* ── STEP 5: TAX QUESTION (multi-select) ────────────────────────────── */}
        {step === 5 && (
          <div>
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 44, marginBottom: 20 }}>🧾</div>
              <h2 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 14px', letterSpacing: '-0.6px' }}>One quick question.</h2>
              <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.65 }}>
                How do you earn your income? Select all that apply. Maslo sets aside the right amount for taxes automatically — so April is never a surprise.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
              {([
                { val: 'w2'            , icon: '🏢', label: 'W-2 Employee',    desc: 'Employer withholds taxes' },
                { val: '1099'          , icon: '💼', label: '1099 / Freelance', desc: 'You pay your own taxes' },
                { val: 'business_owner', icon: '🏗️', label: 'Business Owner',  desc: 'LLC, S-Corp, sole prop' },
              ] as { val: EmploymentType; icon: string; label: string; desc: string }[]).map(opt => {
                const selected = employmentTypes.has(opt.val)
                return (
                  <div
                    key={opt.val}
                    onClick={() => {
                      setEmploymentTypes(prev => {
                        const next = new Set(prev)
                        if (next.has(opt.val)) next.delete(opt.val)
                        else next.add(opt.val)
                        if (next.size === 0) next.add('w2') // always at least one
                        return next
                      })
                    }}
                    style={{
                      ...S.card, padding: '18px 16px', cursor: 'pointer',
                      border: selected ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.07)',
                      background: selected ? 'rgba(124,58,237,0.12)' : '#0d0d24',
                      transition: 'all 0.15s', position: 'relative' as const,
                    }}
                  >
                    {selected && (
                      <div style={{ position: 'absolute', top: 12, right: 12, width: 18, height: 18, borderRadius: 5, background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 800 }}>✓</div>
                    )}
                    <div style={{ fontSize: 28, marginBottom: 8 }}>{opt.icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#f8f8ff', marginBottom: 4 }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>{opt.desc}</div>
                  </div>
                )
              })}
            </div>

            {/* Tax reserve preview */}
            {(() => {
              const hasW2   = employmentTypes.has('w2')
              const has1099 = employmentTypes.has('1099')
              const hasBiz  = employmentTypes.has('business_owner')
              const rate = hasBiz ? 0.30 : has1099 ? 0.27 : 0
              if (rate === 0 && hasW2 && !has1099 && !hasBiz) return null
              const perPaycheck   = parseFloat(income) || 0
              const mult: Record<Freq, number> = { weekly: 52/12, biweekly: 26/12, semimonthly: 2, monthly: 1 }
              const monthlyIncome = perPaycheck * mult[incomeFreq]
              const effectiveRate = hasBiz ? 0.30 : has1099 ? 0.27 : 0.15
              const reserve = Math.round(monthlyIncome * effectiveRate)
              return reserve > 0 ? (
                <div style={{ padding: '14px 18px', background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 12, fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 24, lineHeight: 1.6 }}>
                  🧾 Maslo will set aside <strong style={{ color: '#a78bfa' }}>${reserve.toLocaleString()}/mo</strong> in a Tax Reserve vault automatically. Adjust anytime from your dashboard.
                </div>
              ) : null
            })()}

            <button onClick={() => setStep(6)} style={S.btn}>Continue →</button>
          </div>
        )}

        {/* ── STEP 6: BUDGET PERSONALITY ─────────────────────────────────────── */}
        {step === 6 && (
          <div>
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontSize: 44, marginBottom: 20 }}>🎯</div>
              <h2 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 14px', letterSpacing: '-0.6px' }}>Last thing.</h2>
              <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.65 }}>
                How do you want Maslo to talk to you? This controls your notifications, coaching, and spending alerts.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12, marginBottom: 28 }}>
              {([
                {
                  val: 'drill_sergeant' as Personality,
                  icon: '🪖',
                  label: 'Drill Sergeant',
                  desc: 'No excuses. Tough love. Maximum accountability. You want results, not hand-holding.',
                  sample: '"$47 at Amazon at 2am — your rent vault isn\'t full. What are you doing?"',
                },
                {
                  val: 'coach' as Personality,
                  icon: '💪',
                  label: 'Supportive Coach',
                  desc: 'Encouraging, realistic, and kind. Progress over perfection.',
                  sample: '"Hey — just a heads up, your Lifestyle vault is running a little low this week."',
                },
                {
                  val: 'shaman' as Personality,
                  icon: '🌿',
                  label: 'Financial Shaman',
                  desc: 'Mindful, intentional, balanced. Money as energy and intention.',
                  sample: '"The universe is nudging you — your savings vault needs attention before dining out."',
                },
              ]).map(opt => (
                <div
                  key={opt.val}
                  onClick={() => setPersonality(opt.val)}
                  style={{
                    ...S.card, padding: 20, cursor: 'pointer',
                    border: personality === opt.val ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.07)',
                    background: personality === opt.val ? 'rgba(124,58,237,0.1)' : '#0d0d24',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: personality === opt.val ? 12 : 0 }}>
                    <span style={{ fontSize: 24, lineHeight: 1 }}>{opt.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#f8f8ff', marginBottom: 4 }}>{opt.label}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>{opt.desc}</div>
                    </div>
                    {personality === opt.val && <div style={{ fontSize: 14, color: '#7c3aed' }}>✓</div>}
                  </div>
                  {personality === opt.val && (
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, lineHeight: 1.6 }}>
                      {opt.sample}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#fca5a5', marginBottom: 16, lineHeight: 1.5 }}>
                {error}
              </div>
            )}

            <button onClick={submitOnboarding} disabled={submitting} style={{ ...S.btn, opacity: submitting ? 0.6 : 1 }}>
              Set Up Maslo →
            </button>
          </div>
        )}

        {/* ── STEP 7: CREATING VAULTS ────────────────────────────────────────── */}
        {step === 7 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, justifyContent: 'center' }}>
            <Spinner message="Building your vaults with real data..." />
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', textAlign: 'center' as const, marginTop: 8, lineHeight: 1.6 }}>
              Maslo is ready. Your vaults are being set. Let&apos;s get to work.
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
