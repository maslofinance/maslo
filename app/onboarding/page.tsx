'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { usePlaidLink } from 'react-plaid-link'
import type { PlaidLinkOnSuccess } from 'react-plaid-link'
import { supabase } from '@/lib/supabase'
import type { VaultInput, OnboardingPayload } from '@/app/api/vaults/create/route'
import type { AnalysisResult, DetectedRecurring } from '@/app/api/plaid/analyze/route'

// ─── Types ──────────────────────────────────────────────────────────────────

type Tone  = 'gentle' | 'sarcastic' | 'drill_sergeant' | 'shaman'
type Style = 'liberal' | 'moderate' | 'aggressive'
type Freq  = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'

interface DebtEntry {
  id: string
  type: string
  lender: string
  balance: string
  apr: string
  min_payment: string
  due_day: string
}

interface GoalEntry {
  id: string
  name: string
  emoji: string
  target: string
  months: string
}

interface InvestmentEntry {
  type: string
  amount: string
}

// ─── Style constants ─────────────────────────────────────────────────────────
const S = {
  page:   { minHeight: '100vh', background: '#07071a', color: '#f8f8ff', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif', WebkitFontSmoothing: 'antialiased' as const },
  card:   { background: '#0d0d24', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20 },
  label:  { fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', display: 'block' as const, marginBottom: 6 },
  input:  { width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#f8f8ff', fontSize: 14, outline: 'none', boxSizing: 'border-box' as const },
  btn:    { padding: '14px 28px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', width: '100%' },
  btnSec: { padding: '12px 24px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
}

// ─── Progress bar ────────────────────────────────────────────────────────────
function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>STEP {step} OF {total}</span>
        <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 700 }}>{Math.round((step / total) * 100)}%</span>
      </div>
      <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(step / total) * 100}%`, background: 'linear-gradient(90deg, #7c3aed, #a78bfa)', borderRadius: 99, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}

// ─── Section header ──────────────────────────────────────────────────────────
function SectionHead({ emoji, title, sub }: { emoji: string; title: string; sub: string }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>{emoji}</div>
      <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, letterSpacing: '-0.3px' }}>{title}</h2>
      <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>{sub}</p>
    </div>
  )
}

// ─── Field wrapper ────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={S.label}>{label}</label>
      {children}
    </div>
  )
}

// ─── Detected item card ───────────────────────────────────────────────────────
function DetectedCard({ item, confirmed, onToggle }: {
  item: DetectedRecurring
  confirmed: boolean
  onToggle: () => void
}) {
  return (
    <div
      onClick={onToggle}
      style={{
        padding: '14px 18px',
        border: `1px solid ${confirmed ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 12,
        background: confirmed ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.02)',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8,
        transition: 'all 0.15s',
      }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#f8f8ff' }}>{item.display_name}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
          ${item.amount.toFixed(0)}/mo · {item.category.replace('_', ' ')} · {Math.round(item.confidence * 100)}% confident
        </div>
      </div>
      <div style={{
        width: 22, height: 22, borderRadius: '50%',
        background: confirmed ? '#7c3aed' : 'rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, color: '#fff', flexShrink: 0,
      }}>
        {confirmed ? '✓' : ''}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [userId, setUserId] = useState<string | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [bankLinked, setBankLinked] = useState(false)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [confirmedItems, setConfirmedItems] = useState<Set<string>>(new Set())

  // Form state
  const [income, setIncome] = useState('')
  const [variableIncome, setVariableIncome] = useState('')
  const [hasVariable, setHasVariable] = useState(false)
  const [payFreq, setPayFreq] = useState<Freq>('weekly')
  const [rent, setRent] = useState('')
  const [rentDue, setRentDue] = useState('1')
  const [carPayment, setCarPayment] = useState('')
  const [carDue, setCarDue] = useState('7')
  const [carLender, setCarLender] = useState('')
  const [groceriesPerTrip, setGroceriesPerTrip] = useState('200')
  const [groceriesTrips, setGroceriesTrips] = useState('4')
  const [utilities, setUtilities] = useState('150')
  const [utilitiesDue, setUtilitiesDue] = useState('22')
  const [debts, setDebts] = useState<DebtEntry[]>([])
  const [debtAggression, setDebtAggression] = useState<'minimum' | 'extra' | 'aggressive'>('extra')
  const [emergencyBalance, setEmergencyBalance] = useState('')
  const [emergencyMonthly, setEmergencyMonthly] = useState('')
  const [goals, setGoals] = useState<GoalEntry[]>([])
  const [investments, setInvestments] = useState<InvestmentEntry[]>([
    { type: 'IRA', amount: '' },
    { type: 'Brokerage', amount: '' },
  ])
  const [tone, setTone] = useState<Tone>('drill_sergeant')
  const [budgetStyle, setBudgetStyle] = useState<Style>('aggressive')

  const TOTAL_STEPS = 9

  // ── Auth check ──────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.push('/auth'); return }
      setUserId(data.session.user.id)
      setAccessToken(data.session.access_token)
    })
  }, [router])

  // Helper: auth headers for every API call
  const authHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
  }

  // ── Fetch Plaid link token ───────────────────────────────────────
  useEffect(() => {
    if (!accessToken || linkToken) return
    fetch('/api/plaid/link-token', { method: 'POST', headers: authHeaders })
      .then(r => r.json())
      .then(d => { if (d.link_token) setLinkToken(d.link_token) })
      .catch(e => setError(e.message))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, linkToken])

  // ── Plaid Link ───────────────────────────────────────────────────
  const onPlaidSuccess = useCallback<PlaidLinkOnSuccess>(async (publicToken, metadata) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/plaid/exchange-token', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          public_token: publicToken,
          institution_name: metadata.institution?.name ?? null,
          institution_id: metadata.institution?.institution_id ?? null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setBankLinked(true)
      setStep(3)
      // Auto-run analysis
      setAnalyzing(true)
      const aRes = await fetch('/api/plaid/analyze', { headers: authHeaders })
      const aData: AnalysisResult = await aRes.json()
      setAnalysis(aData)
      // Auto-confirm high-confidence items
      const autoConfirm = new Set<string>()
      ;[...aData.detected_income, ...aData.detected_bills].forEach(item => {
        if (item.confidence > 0.75) autoConfirm.add(item.name)
      })
      setConfirmedItems(autoConfirm)
      // Pre-fill form fields from detected data
      prefillFromAnalysis(aData)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Bank link failed')
    } finally {
      setLoading(false)
      setAnalyzing(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

  function prefillFromAnalysis(data: AnalysisResult) {
    const incomeItem = data.detected_income[0]
    if (incomeItem) {
      // Convert detected per-paycheck amount → monthly based on frequency
      const multipliers: Record<string, number> = {
        weekly:    52 / 12,   // ~4.33
        biweekly:  26 / 12,   // ~2.17
        monthly:   1,
        annual:    1 / 12,
      }
      const mult = multipliers[incomeItem.frequency] ?? 1
      setIncome(String(Math.round(incomeItem.amount * mult)))

      // Wire detected frequency to the pay frequency selector
      const freqMap: Record<string, Freq> = {
        weekly: 'weekly',
        biweekly: 'biweekly',
        monthly: 'monthly',
        annual: 'monthly',
      }
      if (freqMap[incomeItem.frequency]) setPayFreq(freqMap[incomeItem.frequency])
    }

    for (const bill of data.detected_bills) {
      const cat = bill.category
      const amt = String(Math.round(bill.amount))
      if (cat === 'rent' && !rent) setRent(amt)
      if (cat === 'car_payment' && !carPayment) { setCarPayment(amt); setCarLender(bill.display_name) }
      if (cat === 'utility' && !utilities) setUtilities(amt)
    }
  }

  const { open: openPlaid, ready: plaidReady } = usePlaidLink({
    token: linkToken ?? '',
    onSuccess: onPlaidSuccess,
  })

  // ── Computed values ──────────────────────────────────────────────
  const groceries = String(Math.round((parseFloat(groceriesPerTrip) || 0) * (parseFloat(groceriesTrips) || 0)))

  const monthlyNut = [
    parseFloat(rent) || 0,
    parseFloat(carPayment) || 0,
    parseFloat(groceries) || 0,
    parseFloat(utilities) || 0,
    ...debts.map(d => parseFloat(d.min_payment) || 0),
  ].reduce((a, b) => a + b, 0)

  const monthlyIncome = parseFloat(income) || 0
  const remainder = monthlyIncome - monthlyNut

  // ── Submit onboarding ────────────────────────────────────────────
  async function submitOnboarding() {
    setLoading(true)
    setError('')
    try {
      const vaultList: VaultInput[] = []

      // Essentials
      if (rent) vaultList.push({ name: 'Rent', icon: '🏡', category: 'essentials', target_amount: parseFloat(rent), due_day: parseInt(rentDue), lock_type: 'hard_lock', allocation_fixed: parseFloat(rent) })
      if (groceries) vaultList.push({ name: 'Groceries', icon: '🛒', category: 'essentials', target_amount: parseFloat(groceries), lock_type: 'hard_lock', allocation_fixed: parseFloat(groceries) })
      if (utilities) vaultList.push({ name: 'Utilities', icon: '⚡', category: 'essentials', target_amount: parseFloat(utilities), due_day: parseInt(utilitiesDue), lock_type: 'hard_lock', allocation_fixed: parseFloat(utilities) })
      if (carPayment) vaultList.push({ name: `Car Payment${carLender ? ` — ${carLender}` : ''}`, icon: '🚗', category: 'essentials', target_amount: parseFloat(carPayment), due_day: parseInt(carDue), lock_type: 'hard_lock', lender_name: carLender, allocation_fixed: parseFloat(carPayment) })

      // Debt (sorted by APR desc — avalanche method)
      const sortedDebts = [...debts].sort((a, b) => parseFloat(b.apr) - parseFloat(a.apr))
      for (const d of sortedDebts) {
        if (!d.lender || !d.min_payment) continue
        const payment = debtAggression === 'aggressive'
          ? parseFloat(d.min_payment) * 1.5
          : debtAggression === 'extra'
          ? parseFloat(d.min_payment) * 1.2
          : parseFloat(d.min_payment)
        vaultList.push({
          name: `${d.lender}${d.apr ? ` (${d.apr}% APR)` : ''}`,
          icon: d.type === 'credit_card' ? '💳' : d.type === 'student_loan' ? '🎓' : '💰',
          category: 'debt',
          target_amount: Math.round(payment),
          due_day: parseInt(d.due_day) || undefined,
          lock_type: 'hard_lock',
          lender_name: d.lender,
          interest_rate: parseFloat(d.apr),
          allocation_fixed: Math.round(payment),
          description: `Balance: $${d.balance}`,
        })
      }

      // Future
      const efMonthly = parseFloat(emergencyMonthly) || 0
      if (efMonthly > 0) {
        const efTarget = parseFloat(emergencyBalance) > 0
          ? monthlyNut * 3 - parseFloat(emergencyBalance)
          : monthlyNut * 3
        vaultList.push({ name: 'Emergency Fund', icon: '🛟', category: 'future', target_amount: Math.max(efTarget, efMonthly), lock_type: 'soft_lock', allocation_fixed: efMonthly })
      }
      for (const inv of investments) {
        const amt = parseFloat(inv.amount)
        if (amt > 0) vaultList.push({ name: inv.type, icon: inv.type === 'IRA' ? '📈' : '🏦', category: 'future', target_amount: amt, lock_type: 'soft_lock', allocation_fixed: amt })
      }
      for (const g of goals) {
        const monthly = parseFloat(g.target) / Math.max(parseInt(g.months) || 12, 1)
        vaultList.push({ name: `${g.emoji} ${g.name}`, icon: g.emoji, category: 'future', target_amount: parseFloat(g.target), lock_type: 'soft_lock', allocation_fixed: Math.round(monthly) })
      }

      // Lifestyle (remainder)
      vaultList.push({ name: 'Fun Money', icon: '🎉', category: 'lifestyle', target_amount: Math.max(remainder, 0), lock_type: 'flexible' })

      const payload: OnboardingPayload = {
        vaults: vaultList,
        monthly_income: monthlyIncome,
        income_frequency: payFreq,
        budget_style: budgetStyle,
        notification_tone: tone,
        onboarding_mode: 'hybrid',
      }

      const res = await fetch('/api/vaults/create', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push('/')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  // ── Debt helpers ──────────────────────────────────────────────────
  function addDebt() {
    setDebts(d => [...d, { id: crypto.randomUUID(), type: 'credit_card', lender: '', balance: '', apr: '', min_payment: '', due_day: '' }])
  }
  function updateDebt(id: string, field: keyof DebtEntry, val: string) {
    setDebts(d => d.map(x => x.id === id ? { ...x, [field]: val } : x))
  }
  function removeDebt(id: string) { setDebts(d => d.filter(x => x.id !== id)) }

  function addGoal() {
    setGoals(g => [...g, { id: crypto.randomUUID(), name: '', emoji: '🎯', target: '', months: '12' }])
  }
  function updateGoal(id: string, field: keyof GoalEntry, val: string) {
    setGoals(g => g.map(x => x.id === id ? { ...x, [field]: val } : x))
  }
  function removeGoal(id: string) { setGoals(g => g.filter(x => x.id !== id)) }

  function next() { setStep(s => Math.min(s + 1, TOTAL_STEPS)); setError('') }
  function back() { setStep(s => Math.max(s - 1, 1)); setError('') }

  // ─────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────

  return (
    <div style={S.page}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '32px 20px 80px' }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 36 }}>
          <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: '#fff' }}>M</div>
          <span style={{ fontSize: 15, fontWeight: 800, background: 'linear-gradient(135deg,#fff,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>MASLO</span>
        </div>

        <ProgressBar step={step} total={TOTAL_STEPS} />

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#fca5a5', marginBottom: 20 }}>
            {error}
          </div>
        )}

        {/* ── STEP 1: Mode selection ──────────────────────────────── */}
        {step === 1 && (
          <div>
            <SectionHead emoji="👋" title="Welcome to Maslo." sub="The gastric bypass of financial banking apps. How would you like to start?" />

            {[
              { mode: 'Mode 3 — Hybrid (Recommended)', desc: "You know your numbers, but you want Maslo to verify and refine before going full drill sergeant. Connect your bank, set up vaults, and let Maslo learn alongside you for 30 days before full enforcement kicks in.", tag: 'PATIENT ZERO' },
            ].map(m => (
              <div
                key={m.mode}
                onClick={next}
                style={{
                  ...S.card,
                  padding: '20px',
                  marginBottom: 12,
                  cursor: 'pointer',
                  border: '1px solid rgba(124,58,237,0.4)',
                  background: 'rgba(124,58,237,0.06)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#f8f8ff' }}>{m.mode}</span>
                  <span style={{ fontSize: 9, fontWeight: 800, color: '#a78bfa', background: 'rgba(124,58,237,0.2)', padding: '2px 6px', borderRadius: 4 }}>{m.tag}</span>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{m.desc}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── STEP 2: Link Bank ───────────────────────────────────── */}
        {step === 2 && (
          <div>
            <SectionHead emoji="🏦" title="Link your bank." sub="Maslo will analyze 90 days of transactions to pre-fill your setup. Nothing you'll have to type manually." />

            {bankLinked ? (
              <div style={{ ...S.card, padding: 20, border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.06)', marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#10b981', marginBottom: 4 }}>✓ Bank connected</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Transactions analyzed and ready.</div>
              </div>
            ) : (
              <div style={{ marginBottom: 20 }}>
                <button
                  onClick={() => openPlaid()}
                  disabled={!plaidReady || loading}
                  style={{ ...S.btn, marginBottom: 12, opacity: plaidReady ? 1 : 0.5 }}
                >
                  {loading ? 'Connecting...' : '🔗 Connect Bank Account'}
                </button>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
                  Sandbox mode — use test credentials:<br />
                  Username: <b style={{ color: 'rgba(255,255,255,0.5)' }}>user_good</b> · Password: <b style={{ color: 'rgba(255,255,255,0.5)' }}>pass_good</b>
                </p>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={back} style={S.btnSec}>← Back</button>
              {bankLinked && <button onClick={next} style={{ ...S.btn, flex: 1 }}>Continue →</button>}
            </div>
          </div>
        )}

        {/* ── STEP 3: Smart detection ─────────────────────────────── */}
        {step === 3 && (
          <div>
            <SectionHead emoji="🔍" title="Here's what we found." sub="Maslo analyzed your last 90 days. Confirm what's right — correct what isn't." />

            {analyzing && (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>Analyzing your transactions...</div>
              </div>
            )}

            {!analyzing && analysis && (
              <>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', marginBottom: 10 }}>INCOME DETECTED</div>
                  {analysis.detected_income.length === 0 && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>No recurring income detected — you'll enter it manually on the next screen.</div>}
                  {analysis.detected_income.map(item => (
                    <DetectedCard
                      key={item.name}
                      item={item}
                      confirmed={confirmedItems.has(item.name)}
                      onToggle={() => setConfirmedItems(s => { const n = new Set(s); n.has(item.name) ? n.delete(item.name) : n.add(item.name); return n })}
                    />
                  ))}
                </div>

                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', marginBottom: 10 }}>RECURRING BILLS DETECTED</div>
                  {analysis.detected_bills.length === 0 && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>No recurring bills detected — enter them manually next.</div>}
                  {analysis.detected_bills.map(item => (
                    <DetectedCard
                      key={item.name}
                      item={item}
                      confirmed={confirmedItems.has(item.name)}
                      onToggle={() => setConfirmedItems(s => { const n = new Set(s); n.has(item.name) ? n.delete(item.name) : n.add(item.name); return n })}
                    />
                  ))}
                </div>

                <div style={{ ...S.card, padding: '12px 16px', marginBottom: 20, background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.2)' }}>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                    Analyzed <b style={{ color: '#a78bfa' }}>{analysis.raw_transaction_count}</b> transactions from the last 90 days.
                    Tap items to confirm or unconfirm. You'll fine-tune everything on the next screens.
                  </div>
                </div>
              </>
            )}

            {!analyzing && !analysis && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>No bank linked — you'll enter everything manually.</p>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={back} style={S.btnSec}>← Back</button>
              <button onClick={next} style={{ ...S.btn, flex: 1 }}>Looks right →</button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Income ──────────────────────────────────────── */}
        {step === 4 && (
          <div>
            <SectionHead emoji="💵" title="Let's talk income." sub="We build your vaults around your guaranteed take-home pay. Don't include bonuses or side income yet." />

            <Field label="GUARANTEED MONTHLY TAKE-HOME (AFTER TAX) — total across all paychecks">
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>$</span>
                <input value={income} onChange={e => setIncome(e.target.value)} placeholder="5,000" type="number" style={{ ...S.input, paddingLeft: 28 }} />
              </div>
            </Field>

            <Field label="HOW OFTEN DO YOU GET PAID?">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(['weekly', 'biweekly', 'semimonthly', 'monthly'] as Freq[]).map(f => (
                  <div key={f} onClick={() => setPayFreq(f)} style={{
                    padding: '10px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'center' as const, fontSize: 13, fontWeight: 600,
                    border: payFreq === f ? '1px solid #7c3aed' : '1px solid rgba(255,255,255,0.1)',
                    background: payFreq === f ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.03)',
                    color: payFreq === f ? '#a78bfa' : 'rgba(255,255,255,0.6)',
                  }}>
                    {f === 'semimonthly' ? '1st & 15th' : f.charAt(0).toUpperCase() + f.slice(1)}
                  </div>
                ))}
              </div>
            </Field>

            <div onClick={() => setHasVariable(!hasVariable)} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: hasVariable ? 16 : 0, cursor: 'pointer' }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, border: `1px solid ${hasVariable ? '#7c3aed' : 'rgba(255,255,255,0.2)'}`, background: hasVariable ? '#7c3aed' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff' }}>{hasVariable ? '✓' : ''}</div>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>I have variable / side income too</span>
            </div>
            {hasVariable && (
              <Field label="AVERAGE MONTHLY VARIABLE INCOME">
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>$</span>
                  <input value={variableIncome} onChange={e => setVariableIncome(e.target.value)} placeholder="500" type="number" style={{ ...S.input, paddingLeft: 28 }} />
                </div>
              </Field>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button onClick={back} style={S.btnSec}>← Back</button>
              <button onClick={next} disabled={!income} style={{ ...S.btn, flex: 1, opacity: income ? 1 : 0.5 }}>Continue →</button>
            </div>
          </div>
        )}

        {/* ── STEP 5: Essentials ─────────────────────────────────── */}
        {step === 5 && (
          <div>
            <SectionHead emoji="🏡" title="Fixed essentials." sub="These are your non-negotiable monthly bills. Funded first, every single paycheck." />

            <div style={{ ...S.card, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 14 }}>RENT / MORTGAGE</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="MONTHLY AMOUNT">
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>$</span>
                    <input value={rent} onChange={e => setRent(e.target.value)} placeholder="1,705" type="number" style={{ ...S.input, paddingLeft: 28 }} />
                  </div>
                </Field>
                <Field label="DUE DATE">
                  <select value={rentDue} onChange={e => setRentDue(e.target.value)} style={{ ...S.input }}>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}{d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'}</option>)}
                  </select>
                </Field>
              </div>
            </div>

            <div style={{ ...S.card, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 14 }}>CAR PAYMENT</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="MONTHLY AMOUNT">
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>$</span>
                    <input value={carPayment} onChange={e => setCarPayment(e.target.value)} placeholder="417" type="number" style={{ ...S.input, paddingLeft: 28 }} />
                  </div>
                </Field>
                <Field label="DUE DATE">
                  <select value={carDue} onChange={e => setCarDue(e.target.value)} style={{ ...S.input }}>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}{d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="LENDER (for auto-matching payments)">
                <input value={carLender} onChange={e => setCarLender(e.target.value)} placeholder="Honda Financial, Ally, etc." style={S.input} />
              </Field>
            </div>

            <div style={{ ...S.card, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 14 }}>GROCERIES</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <Field label="AVG SPEND PER TRIP">
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>$</span>
                    <input value={groceriesPerTrip} onChange={e => setGroceriesPerTrip(e.target.value)} placeholder="150" type="number" style={{ ...S.input, paddingLeft: 28 }} />
                  </div>
                </Field>
                <Field label="TRIPS PER MONTH">
                  <select value={groceriesTrips} onChange={e => setGroceriesTrips(e.target.value)} style={S.input}>
                    {[1,2,3,4,5,6,8,10,12].map(n => (
                      <option key={n} value={n}>{n}x {n === 4 ? '(weekly)' : n === 8 ? '(2x/wk)' : n === 2 ? '(biweekly)' : n === 1 ? '(monthly)' : ''}</option>
                    ))}
                  </select>
                </Field>
              </div>
              {groceriesPerTrip && groceriesTrips && (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  Monthly grocery budget: <span style={{ color: '#a78bfa', fontWeight: 700 }}>${groceries}</span>
                </div>
              )}
            </div>

            <div style={{ ...S.card, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 14 }}>UTILITIES</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="MONTHLY AMOUNT">
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>$</span>
                    <input value={utilities} onChange={e => setUtilities(e.target.value)} placeholder="150" type="number" style={{ ...S.input, paddingLeft: 28 }} />
                  </div>
                </Field>
                <Field label="DUE DATE">
                  <select value={utilitiesDue} onChange={e => setUtilitiesDue(e.target.value)} style={S.input}>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d}>{d}{d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={back} style={S.btnSec}>← Back</button>
              <button onClick={next} style={{ ...S.btn, flex: 1 }}>Continue →</button>
            </div>
          </div>
        )}

        {/* ── STEP 6: Debt ────────────────────────────────────────── */}
        {step === 6 && (
          <div>
            <SectionHead emoji="💳" title="Let's kill your debt." sub="Maslo attacks highest interest rate first — the avalanche method. Every dollar above minimum goes to the most expensive debt." />

            {debts.map((d, i) => (
              <div key={d.id} style={{ ...S.card, padding: 20, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#f8f8ff' }}>Debt #{i + 1}</div>
                  <button onClick={() => removeDebt(d.id)} style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.7)', cursor: 'pointer', fontSize: 13 }}>Remove</button>
                </div>
                <Field label="TYPE">
                  <select value={d.type} onChange={e => updateDebt(d.id, 'type', e.target.value)} style={S.input}>
                    <option value="credit_card">Credit Card</option>
                    <option value="student_loan">Student Loan</option>
                    <option value="personal_loan">Personal Loan</option>
                    <option value="medical">Medical Debt</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="LENDER NAME">
                    <input value={d.lender} onChange={e => updateDebt(d.id, 'lender', e.target.value)} placeholder="Chase, Sallie Mae..." style={S.input} />
                  </Field>
                  <Field label="CURRENT BALANCE">
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>$</span>
                      <input value={d.balance} onChange={e => updateDebt(d.id, 'balance', e.target.value)} placeholder="4,200" type="number" style={{ ...S.input, paddingLeft: 28 }} />
                    </div>
                  </Field>
                  <Field label="INTEREST RATE (APR %)">
                    <input value={d.apr} onChange={e => updateDebt(d.id, 'apr', e.target.value)} placeholder="22.9" type="number" style={S.input} />
                  </Field>
                  <Field label="MIN MONTHLY PAYMENT">
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>$</span>
                      <input value={d.min_payment} onChange={e => updateDebt(d.id, 'min_payment', e.target.value)} placeholder="200" type="number" style={{ ...S.input, paddingLeft: 28 }} />
                    </div>
                  </Field>
                </div>
              </div>
            ))}

            <button onClick={addDebt} style={{ ...S.btnSec, width: '100%', marginBottom: 20 }}>+ Add Debt</button>

            {debts.length > 0 && (
              <div style={{ ...S.card, padding: 16, marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>HOW AGGRESSIVELY DO YOU WANT TO ATTACK YOUR DEBT?</div>
                {[
                  { val: 'minimum', label: '🟢 Minimum Payments', desc: 'Pay minimums, free up cash for goals' },
                  { val: 'extra', label: '🟡 Pay Extra', desc: 'Minimums + 20% extra toward highest rate' },
                  { val: 'aggressive', label: '🔴 Full Attack', desc: 'Maximum payoff — minimize everything else' },
                ].map(opt => (
                  <div key={opt.val} onClick={() => setDebtAggression(opt.val as typeof debtAggression)} style={{
                    padding: '10px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 6,
                    border: debtAggression === opt.val ? '1px solid rgba(124,58,237,0.4)' : '1px solid transparent',
                    background: debtAggression === opt.val ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.02)',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#f8f8ff' }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{opt.desc}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={back} style={S.btnSec}>← Back</button>
              <button onClick={next} style={{ ...S.btn, flex: 1 }}>Continue →</button>
            </div>
          </div>
        )}

        {/* ── STEP 7: The Remainder Conversation ─────────────────── */}
        {step === 7 && (
          <div>
            <SectionHead emoji="✨" title="Here's the math." sub="Your monthly nut vs your income. This is the moment of truth." />

            <div style={{ ...S.card, padding: 24, marginBottom: 24, background: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(13,13,36,0.8))' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, textAlign: 'center' as const }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>MONTHLY NUT</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#ef4444' }}>${monthlyNut.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>INCOME</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#10b981' }}>${monthlyIncome.toLocaleString()}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>REMAINDER</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: remainder >= 0 ? '#a78bfa' : '#ef4444' }}>${remainder.toLocaleString()}</div>
                </div>
              </div>
              <div style={{ marginTop: 16, fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center' as const }}>
                {remainder > 0
                  ? `$${remainder.toFixed(0)}/mo left. Let's put it to work.`
                  : `You're over budget by $${Math.abs(remainder).toFixed(0)}/mo. Let's find cuts.`}
              </div>
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>EMERGENCY FUND</div>
            <div style={{ ...S.card, padding: 20, marginBottom: 16 }}>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                Recommended: <b style={{ color: '#a78bfa' }}>${(monthlyNut * 3).toLocaleString()}</b> (3 months of expenses)
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="CURRENT BALANCE">
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>$</span>
                    <input value={emergencyBalance} onChange={e => setEmergencyBalance(e.target.value)} placeholder="0" type="number" style={{ ...S.input, paddingLeft: 28 }} />
                  </div>
                </Field>
                <Field label="MONTHLY CONTRIBUTION">
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>$</span>
                    <input value={emergencyMonthly} onChange={e => setEmergencyMonthly(e.target.value)} placeholder="200" type="number" style={{ ...S.input, paddingLeft: 28 }} />
                  </div>
                </Field>
              </div>
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>SAVINGS GOALS</div>
            {goals.map((g) => (
              <div key={g.id} style={{ ...S.card, padding: 16, marginBottom: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: 10, marginBottom: 10 }}>
                  <Field label="EMOJI">
                    <input value={g.emoji} onChange={e => updateGoal(g.id, 'emoji', e.target.value)} style={{ ...S.input, textAlign: 'center' as const, padding: '10px 4px', fontSize: 18 }} />
                  </Field>
                  <Field label="GOAL NAME">
                    <input value={g.name} onChange={e => updateGoal(g.id, 'name', e.target.value)} placeholder="Costa Rica surf trip" style={S.input} />
                  </Field>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="TARGET AMOUNT">
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>$</span>
                      <input value={g.target} onChange={e => updateGoal(g.id, 'target', e.target.value)} placeholder="3,000" type="number" style={{ ...S.input, paddingLeft: 28 }} />
                    </div>
                  </Field>
                  <Field label="MONTHS TO SAVE">
                    <input value={g.months} onChange={e => updateGoal(g.id, 'months', e.target.value)} placeholder="12" type="number" style={S.input} />
                  </Field>
                </div>
                {g.target && g.months && (
                  <div style={{ fontSize: 12, color: '#a78bfa', marginTop: 4 }}>
                    = ${(parseFloat(g.target) / parseInt(g.months)).toFixed(0)}/month
                  </div>
                )}
                <button onClick={() => removeGoal(g.id)} style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.6)', cursor: 'pointer', fontSize: 12, marginTop: 8, padding: 0 }}>Remove goal</button>
              </div>
            ))}
            <button onClick={addGoal} style={{ ...S.btnSec, width: '100%', marginBottom: 16 }}>+ Add Savings Goal</button>

            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>INVESTMENTS</div>
            <div style={{ ...S.card, padding: 20, marginBottom: 20 }}>
              {investments.map((inv, i) => (
                <div key={inv.type} style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 10, marginBottom: i < investments.length - 1 ? 12 : 0 }}>
                  <Field label="TYPE">
                    <input value={inv.type} onChange={e => setInvestments(ii => ii.map((x, j) => j === i ? { ...x, type: e.target.value } : x))} style={S.input} />
                  </Field>
                  <Field label="MONTHLY AMOUNT">
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>$</span>
                      <input value={inv.amount} onChange={e => setInvestments(ii => ii.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} placeholder="0" type="number" style={{ ...S.input, paddingLeft: 28 }} />
                    </div>
                  </Field>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={back} style={S.btnSec}>← Back</button>
              <button onClick={next} style={{ ...S.btn, flex: 1 }}>Continue →</button>
            </div>
          </div>
        )}

        {/* ── STEP 8: Personality ─────────────────────────────────── */}
        {step === 8 && (
          <div>
            <SectionHead emoji="🎭" title="How should Maslo talk to you?" sub="This sets the tone for every notification, every nudge, every callout." />

            <div style={{ display: 'grid', gap: 12, marginBottom: 28 }}>
              {[
                { val: 'drill_sergeant', icon: '🪖', label: 'Drill Sergeant', desc: '"$6 on Starbucks?! Your emergency fund is EMPTY. What are you doing?"' },
                { val: 'shaman', icon: '🧘', label: 'Financial Shaman', desc: '"The universe is nudging you — your savings vault needs attention before dining out."' },
                { val: 'gentle', icon: '🤝', label: 'Supportive Coach', desc: '"Hey — just a heads up, your Lifestyle vault is running low this week."' },
              ].map(opt => (
                <div
                  key={opt.val}
                  onClick={() => setTone(opt.val as Tone)}
                  style={{
                    ...S.card,
                    padding: '18px 20px',
                    cursor: 'pointer',
                    border: tone === opt.val ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.07)',
                    background: tone === opt.val ? 'rgba(124,58,237,0.1)' : '#0d0d24',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 20 }}>{opt.icon}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#f8f8ff' }}>{opt.label}</span>
                    {tone === opt.val && <span style={{ marginLeft: 'auto', fontSize: 12, color: '#7c3aed', fontWeight: 700 }}>SELECTED</span>}
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.45)', fontStyle: 'italic', lineHeight: 1.4 }}>{opt.desc}</p>
                </div>
              ))}
            </div>

            <Field label="BUDGET STYLE">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {(['liberal', 'moderate', 'aggressive'] as Style[]).map(s => (
                  <div key={s} onClick={() => setBudgetStyle(s)} style={{
                    padding: '10px', borderRadius: 10, cursor: 'pointer', textAlign: 'center' as const, fontSize: 12, fontWeight: 700,
                    border: budgetStyle === s ? '1px solid #7c3aed' : '1px solid rgba(255,255,255,0.1)',
                    background: budgetStyle === s ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.03)',
                    color: budgetStyle === s ? '#a78bfa' : 'rgba(255,255,255,0.6)',
                  }}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </div>
                ))}
              </div>
            </Field>

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button onClick={back} style={S.btnSec}>← Back</button>
              <button onClick={next} style={{ ...S.btn, flex: 1 }}>Almost there →</button>
            </div>
          </div>
        )}

        {/* ── STEP 9: Vault preview + confirm ─────────────────────── */}
        {step === 9 && (
          <div>
            <SectionHead emoji="🔐" title="Your vault system." sub="Here's how Maslo will structure your money. Review and activate." />

            {/* Vault preview */}
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, marginBottom: 24 }}>
              {[
                { label: 'ESSENTIALS', color: '#3b82f6', items: [
                  rent && { name: 'Rent', icon: '🏡', amount: parseFloat(rent), due: rentDue },
                  groceries && { name: 'Groceries', icon: '🛒', amount: parseFloat(groceries) },
                  utilities && { name: 'Utilities', icon: '⚡', amount: parseFloat(utilities), due: utilitiesDue },
                  carPayment && { name: `Car — ${carLender || 'Payment'}`, icon: '🚗', amount: parseFloat(carPayment), due: carDue },
                ].filter(Boolean) },
                { label: 'DEBT', color: '#ef4444', items: debts.map(d => ({ name: d.lender, icon: '💳', amount: parseFloat(d.min_payment) || 0 })) },
                { label: 'FUTURE', color: '#8b5cf6', items: [
                  parseFloat(emergencyMonthly) > 0 && { name: 'Emergency Fund', icon: '🛟', amount: parseFloat(emergencyMonthly) },
                  ...investments.filter(i => parseFloat(i.amount) > 0).map(i => ({ name: i.type, icon: '📈', amount: parseFloat(i.amount) })),
                  ...goals.filter(g => g.name && g.target).map(g => ({ name: `${g.emoji} ${g.name}`, icon: g.emoji, amount: parseFloat(g.target) / Math.max(parseInt(g.months) || 12, 1) })),
                ].filter(Boolean) },
                { label: 'LIFESTYLE', color: '#10b981', items: [{ name: 'Fun Money', icon: '🎉', amount: Math.max(remainder, 0) }] },
              ].map(section => (
                <div key={section.label} style={{ ...S.card, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 8, background: `${section.color}0d` }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: section.color }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: section.color, letterSpacing: '0.07em' }}>{section.label}</span>
                  </div>
                  {(section.items as Array<{ name: string; icon: string; amount: number; due?: string } | false>).filter(Boolean).map((item, i) => {
                    if (!item) return null
                    return (
                      <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, color: '#f8f8ff' }}>{item.icon} {item.name}{item.due ? ` · due ${item.due}${parseInt(item.due) === 1 ? 'st' : parseInt(item.due) <= 3 ? 'nd/rd' : 'th'}` : ''}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>${item.amount.toFixed(0)}/mo</span>
                      </div>
                    )
                  })}
                  {section.items.filter(Boolean).length === 0 && (
                    <div style={{ padding: '10px 16px', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No {section.label.toLowerCase()} vaults added.</div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ ...S.card, padding: 16, marginBottom: 20, background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.2)' }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                Mode 3 Hybrid activated — Maslo will learn alongside you for 30 days, sending gentle nudges but not hard enforcing. At day 30, you'll review the real data and flip the switch to full enforcement.
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={back} style={S.btnSec}>← Back</button>
              <button
                onClick={submitOnboarding}
                disabled={loading}
                style={{ ...S.btn, flex: 1, background: loading ? 'rgba(124,58,237,0.4)' : 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
              >
                {loading ? 'Building your vaults...' : '🚀 Activate Maslo'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
