'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import { supabase } from '@/lib/supabase'
import type { VaultInput, OnboardingPayload } from '@/app/api/vaults/create/route'
import { detectSubscriptions, type DetectedSubscription } from '@/lib/subscription-detector'
import { estimateTaxes, US_STATES, type FilingStatus, type EmploymentType, type IncomeType } from '@/lib/tax-estimator'
import { analyzeBankData, type BankPrefillResult, type Confidence } from '@/lib/bank-prefill'

// Lazy Stripe loader — never runs during SSR
let stripePromise: ReturnType<typeof loadStripe> | null = null
function getStripe() {
  if (!stripePromise) stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)
  return stripePromise
}

// ─── Types ──────────────────────────────────────────────────────────────────

type Tone  = 'gentle' | 'sarcastic' | 'drill_sergeant' | 'shaman'
type Style = 'liberal' | 'moderate' | 'aggressive'
type Freq  = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'

interface UtilityEntry {
  id: string
  type: string
  amount: string
  due_day: string
  confidence?: Confidence
  source?: string
}

interface DetectedField {
  confidence: Confidence
  source: string
}

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


// ─── Main component ───────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [userId, setUserId] = useState<string | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [bankLinked, setBankLinked] = useState(false)
  const [bankLinking, setBankLinking] = useState(false)
  const [subscriptions, setSubscriptions] = useState<DetectedSubscription[]>([])
  const [linkedAccountId, setLinkedAccountId] = useState<string | null>(null)

  // Form state
  const [income, setIncome] = useState('')
  const [variableIncome, setVariableIncome] = useState('')
  const [hasVariable, setHasVariable] = useState(false)
  const [payFreq, setPayFreq] = useState<Freq>('weekly')
  const [rent, setRent] = useState('')
  const [rentDue, setRentDue] = useState('1')
  const [insurances, setInsurances] = useState<{ id: string; type: string; amount: string; due_day: string }[]>([])

  const [groceriesPerTrip, setGroceriesPerTrip] = useState('200')
  const [groceriesTrips, setGroceriesTrips] = useState('4')
  const [utilityList, setUtilityList] = useState<UtilityEntry[]>([])
  const [detectedFields, setDetectedFields] = useState<Record<string, DetectedField>>({})
  const [bankNudges, setBankNudges] = useState<string[]>([])
  const [cars, setCars] = useState<{ id: string; type: 'loan' | 'lease' | 'rent'; amount: string; due_day: string; lender: string }[]>([])
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

  // Tax profile
  const [employmentType, setEmploymentType] = useState<EmploymentType>('w2')
  const [incomeType, setIncomeType] = useState<IncomeType>('net')
  const [selfEmployedIncome, setSelfEmployedIncome] = useState('')
  const [filingStatus, setFilingStatus] = useState<FilingStatus>('single')
  const [taxState, setTaxState] = useState('TX')
  const [dependents, setDependents] = useState('0')

  // Business deductions (1099/mixed/business_owner only)
  const MILEAGE_RATE = 0.67  // 2024 IRS standard mileage rate
  const [homeOfficePct, setHomeOfficePct]           = useState('')   // % of home used for business
  const [businessMileage, setBusinessMileage]       = useState('')   // miles/month
  const [carBusinessPct, setCarBusinessPct]         = useState('')   // % of car payment that's business use
  const [gasMonthly, setGasMonthly]                 = useState('')   // monthly gas for business
  const [phoneMonthly, setPhoneMonthly]             = useState('')   // total monthly phone + internet bill
  const [phoneBusinessPct, setPhoneBusinessPct]     = useState('')   // % used for business
  const [healthInsuranceBiz, setHealthInsuranceBiz] = useState('')   // monthly self-employed health insurance

  const TOTAL_STEPS = 10

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

  // ── Apply bank pre-fill ──────────────────────────────────────────
  function applyPrefill(p: BankPrefillResult) {
    const detected: Record<string, DetectedField> = {}

    if (p.income) {
      setIncome(p.income.value)
      if (p.income.freq) setPayFreq(p.income.freq)
      detected['income'] = { confidence: p.income.confidence, source: p.income.source }
    }

    if (p.rent) {
      setRent(p.rent.value)
      detected['rent'] = { confidence: p.rent.confidence, source: p.rent.source }
    }

    if (p.utilities.length > 0) {
      setUtilityList(p.utilities.map(u => ({
        id: crypto.randomUUID(),
        type: u.type,
        amount: u.amount,
        due_day: u.due_day,
        confidence: u.confidence,
        source: u.source,
      })))
    }

    if (p.insurances.length > 0) {
      setInsurances(p.insurances.map(i => ({
        id: crypto.randomUUID(),
        type: i.type,
        amount: i.amount,
        due_day: i.due_day,
        confidence: i.confidence,
        source: i.source,
      } as any)))
    }

    if (p.cars.length > 0) {
      setCars(p.cars.map(c => ({
        id: crypto.randomUUID(),
        type: c.type,
        amount: c.amount,
        due_day: c.due_day,
        lender: c.lender,
        confidence: c.confidence,
        source: c.source,
      } as any)))
    }

    if (p.groceries) {
      // Split into per-trip estimate (assume 4 trips/mo)
      const monthly = parseFloat(p.groceries.value)
      setGroceriesPerTrip(String(Math.round(monthly / 4)))
      setGroceriesTrips('4')
      detected['groceries'] = { confidence: p.groceries.confidence, source: p.groceries.source }
    }

    setDetectedFields(detected)
    setBankNudges(p.nudges)
  }

  // ── Stripe Financial Connections ────────────────────────────────
  async function linkBankWithStripe() {
    setBankLinking(true)
    setError('')
    try {
      const res = await fetch('/api/stripe/financial-connections/session', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ userId }),
      })
      const { client_secret, error: sessionError } = await res.json()
      if (sessionError) throw new Error(sessionError)

      const stripe = await getStripe()
      if (!stripe) throw new Error('Stripe failed to load')

      const result = await (stripe as any).collectFinancialConnectionsAccounts({ clientSecret: client_secret })
      if (result.error) throw new Error(result.error.message)
      if (!result.financialConnectionsSession?.accounts?.length) throw new Error('No accounts linked. Please try again.')

      const accountId = result.financialConnectionsSession.accounts[0].id
      setLinkedAccountId(accountId)

      // Pull 180-day transactions
      const txRes = await fetch(`/api/stripe/financial-connections/transactions?account_id=${accountId}`)
      const txData = await txRes.json()

      if (!txData.error && txData.transactions?.length) {
        const rawForSubs = txData.transactions.map((tx: any) => ({
          id: tx.id,
          date: tx.date,
          amount: Math.abs(tx.amount / 100),
          description: tx.description ?? '',
          isIncome: tx.amount < 0,
        }))

        // Subscription detection
        setSubscriptions(detectSubscriptions(rawForSubs))

        // Pre-fill engine
        const rawForPrefill = txData.transactions.map((tx: any) => ({
          id: tx.id,
          date: tx.date,
          amount: tx.amount / 100,   // signed: negative = income, positive = expense
          description: tx.description ?? '',
        }))
        const prefill: BankPrefillResult = analyzeBankData(rawForPrefill)
        applyPrefill(prefill)
      }

      setBankLinked(true)
      next()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Bank link failed')
    } finally {
      setBankLinking(false)
    }
  }

  // ── Computed values ──────────────────────────────────────────────
  const groceries = String(Math.round((parseFloat(groceriesPerTrip) || 0) * (parseFloat(groceriesTrips) || 0)))

  const monthlyNut = [
    parseFloat(rent) || 0,
    parseFloat(groceries) || 0,
    ...utilityList.map(u => parseFloat(u.amount) || 0),
    ...cars.map(c => parseFloat(c.amount) || 0),
    ...insurances.map(i => parseFloat(i.amount) || 0),
    ...debts.map(d => parseFloat(d.min_payment) || 0),
    parseFloat(emergencyMonthly) || 0,
    ...investments.map(i => parseFloat(i.amount) || 0),
    ...goals.map(g => g.target && g.months ? Math.round(parseFloat(g.target) / Math.max(parseInt(g.months), 1)) : 0),
  ].reduce((a, b) => a + b, 0)

  const monthlyIncome = (parseFloat(income) || 0) + (hasVariable ? (parseFloat(variableIncome) || 0) : 0)
  const remainder = monthlyIncome - monthlyNut

  // ── Business deduction totals ────────────────────────────────────
  const isSelfEmployed = employmentType === '1099' || employmentType === 'mixed' || employmentType === 'business_owner'
  const homeOfficeDeduction  = isSelfEmployed ? (parseFloat(rent) || 0) * (parseFloat(homeOfficePct) || 0) / 100 : 0
  const mileageDeduction     = isSelfEmployed ? (parseFloat(businessMileage) || 0) * MILEAGE_RATE : 0
  const carTotalPayment      = cars.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0)
  const carDeduction         = isSelfEmployed ? carTotalPayment * (parseFloat(carBusinessPct) || 0) / 100 : 0
  const gasDeduction         = isSelfEmployed ? (parseFloat(gasMonthly) || 0) : 0
  const phoneDeduction       = isSelfEmployed ? (parseFloat(phoneMonthly) || 0) * (parseFloat(phoneBusinessPct) || 0) / 100 : 0
  const healthBizDeduction   = isSelfEmployed ? (parseFloat(healthInsuranceBiz) || 0) : 0
  const totalMonthlyBizDeds  = homeOfficeDeduction + mileageDeduction + carDeduction + gasDeduction + phoneDeduction + healthBizDeduction
  const totalAnnualBizDeds   = totalMonthlyBizDeds * 12

  // ── Tax estimate ─────────────────────────────────────────────────
  const w2Monthly = employmentType === 'w2' ? monthlyIncome
    : employmentType === 'mixed' ? monthlyIncome
    : 0
  const seMonthly = employmentType === '1099' ? monthlyIncome
    : employmentType === 'business_owner' ? monthlyIncome
    : employmentType === 'mixed' ? (parseFloat(selfEmployedIncome) || 0)
    : 0
  const taxEstimate = estimateTaxes({
    employmentType,
    incomeType,
    w2MonthlyGross: employmentType === 'mixed' ? monthlyIncome - (parseFloat(selfEmployedIncome) || 0) : w2Monthly,
    selfEmployedMonthlyGross: seMonthly,
    filingStatus,
    state: taxState,
    dependents: parseInt(dependents) || 0,
    annualDeductions: investments.reduce((a, inv) => a + (parseFloat(inv.amount) || 0), 0) * 12,
    annualBusinessDeductions: totalAnnualBizDeds,
  })
  const taxReserveMonthly = taxEstimate.monthlyReserve

  // ── Foundation vs Future split ────────────────────────────────────
  const essentialsTotal = [
    parseFloat(rent) || 0,
    parseFloat(groceries) || 0,
    ...utilityList.map(u => parseFloat(u.amount) || 0),
    ...insurances.map(i => parseFloat(i.amount) || 0),
  ].reduce((a, b) => a + b, 0)

  const debtTotal = [
    ...cars.map(c => parseFloat(c.amount) || 0),
    ...debts.map(d => parseFloat(d.min_payment) || 0),
  ].reduce((a, b) => a + b, 0)

  const foundationTotal = essentialsTotal + debtTotal + taxReserveMonthly
  const foundationRemainder = monthlyIncome - foundationTotal

  // Debt payoff projection (months until last debt is cleared)
  const debtPayoffMonths = debts.length > 0
    ? Math.max(...debts.map(d => {
        const bal = parseFloat(d.balance) || 0
        const pay = parseFloat(d.min_payment) || 1
        return pay > 0 ? Math.ceil(bal / pay) : 0
      }))
    : 0

  // Emergency fund projection
  const efTarget = monthlyNut * 3
  const efCurrent = parseFloat(emergencyBalance) || 0
  const efMonthlyAmt = parseFloat(emergencyMonthly) || 0
  const efRemaining = Math.max(efTarget - efCurrent, 0)
  const efMonthsNeeded = efMonthlyAmt > 0 ? Math.ceil(efRemaining / efMonthlyAmt) : 0

  // Unlock = when BOTH debt is gone AND emergency fund is full
  const unlockMonths = Math.max(debtPayoffMonths, efMonthsNeeded)
  const unlockDate = new Date()
  unlockDate.setMonth(unlockDate.getMonth() + unlockMonths)
  const unlockDateStr = unlockDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // ── Future allocation tracking ────────────────────────────────────
  const futureAllocated =
    (parseFloat(emergencyMonthly) || 0) +
    investments.reduce((a, inv) => a + (parseFloat(inv.amount) || 0), 0) +
    goals.reduce((a, g) => a + (g.target && g.months ? Math.round(parseFloat(g.target) / Math.max(parseInt(g.months), 1)) : 0), 0)

  const futureAvailable = Math.max(foundationRemainder, 0)
  const futureRemaining = futureAvailable - futureAllocated
  const futureOverAllocated = futureAllocated > futureAvailable
  const futureAllocPct = futureAvailable > 0 ? Math.min((futureAllocated / futureAvailable) * 100, 100) : 0

  // ── Submit onboarding ────────────────────────────────────────────
  async function submitOnboarding() {
    setLoading(true)
    setError('')
    try {
      const vaultList: VaultInput[] = []

      // Essentials
      if (rent) vaultList.push({ name: 'Rent', icon: '🏡', category: 'essentials', target_amount: parseFloat(rent), due_day: parseInt(rentDue), lock_type: 'hard_lock', allocation_fixed: parseFloat(rent) })
      if (groceries) vaultList.push({ name: 'Groceries', icon: '🛒', category: 'essentials', target_amount: parseFloat(groceries), lock_type: 'hard_lock', allocation_fixed: parseFloat(groceries) })
      const UTILITY_ICONS: Record<string, string> = { 'Electric': '⚡', 'Water': '💧', 'Gas / Heat': '🔥', 'WiFi / Internet': '📶', 'Phone': '📱', 'Trash': '🗑️', 'HOA': '🏘️', 'Sewer': '🚿' }
      for (const u of utilityList) {
        if (!u.amount || parseFloat(u.amount) <= 0) continue
        vaultList.push({ name: u.type, icon: UTILITY_ICONS[u.type] ?? '🔌', category: 'essentials', target_amount: parseFloat(u.amount), due_day: parseInt(u.due_day) || undefined, lock_type: 'hard_lock', allocation_fixed: parseFloat(u.amount) })
      }
      for (const ins of insurances) {
        if (!ins.amount || parseFloat(ins.amount) <= 0) continue
        vaultList.push({ name: `${ins.type} Insurance`, icon: '🛡️', category: 'essentials', target_amount: parseFloat(ins.amount), due_day: parseInt(ins.due_day), lock_type: 'hard_lock', allocation_fixed: parseFloat(ins.amount) })
      }

      // Tax Reserve vault (only for 1099 / business / gross W-2)
      if (taxReserveMonthly > 0) {
        vaultList.push({
          name: 'Tax Reserve',
          icon: '🧾',
          category: 'essentials',
          target_amount: taxReserveMonthly,
          lock_type: 'hard_lock',
          allocation_fixed: taxReserveMonthly,
          description: `~${(taxEstimate.effectiveRate * 100).toFixed(1)}% effective rate · $${taxEstimate.annualTaxEstimate.toLocaleString()}/yr est.`,
        })
      }

      // Car payments → Debt
      for (const car of cars) {
        if (!car.amount || parseFloat(car.amount) <= 0) continue
        const label = car.type === 'loan' ? 'Car Loan' : car.type === 'lease' ? 'Car Lease' : 'Car Rent-to-Own'
        vaultList.push({ name: `${label}${car.lender ? ` — ${car.lender}` : ''}`, icon: '🚗', category: 'debt', target_amount: parseFloat(car.amount), due_day: parseInt(car.due_day), lock_type: 'hard_lock', lender_name: car.lender, allocation_fixed: parseFloat(car.amount) })
      }

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

      // Lifestyle — whatever wasn't allocated in Phase 2
      const funMoney = Math.max(futureRemaining, 0)
      vaultList.push({ name: 'Fun Money', icon: '🎉', category: 'lifestyle', target_amount: funMoney, lock_type: 'flexible' })

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
            <SectionHead emoji="🏦" title="Link your bank." sub="Maslo connects via Stripe Financial Connections — secure, read-only, 180 days of history." />

            {bankLinked ? (
              <div style={{ ...S.card, padding: 20, border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.06)', marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#10b981', marginBottom: 4 }}>✓ Bank connected</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Ready to go. Continue when you&apos;re ready.</div>
              </div>
            ) : (
              <div style={{ marginBottom: 20 }}>

                {/* Primary: manual entry */}
                <button
                  onClick={() => setStep(4)}
                  style={{ ...S.btn, marginBottom: 16 }}
                >
                  ✏️ Enter My Numbers Manually
                </button>

                {/* Coming soon: bank link */}
                <div style={{ ...S.card, padding: 16, opacity: 0.5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>🔗</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#f8f8ff' }}>Connect Bank Account</span>
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 800, color: '#a78bfa', background: 'rgba(124,58,237,0.2)', padding: '3px 7px', borderRadius: 4, letterSpacing: '0.05em' }}>COMING SOON</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
                    Stripe Financial Connections activation pending. Once live, Maslo will auto-read 180 days of transactions and pre-fill everything below.
                  </p>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={back} style={S.btnSec}>← Back</button>
              {bankLinked && <button onClick={next} style={{ ...S.btn, flex: 1 }}>Continue →</button>}
            </div>
          </div>
        )}

        {/* ── STEP 3: Subscription Audit ──────────────────────────── */}
        {step === 3 && (
          <div>
            <SectionHead
              emoji="🔍"
              title="Here's what's bleeding you."
              sub="Maslo scanned 180 days of transactions and found these recurring charges. Keep what you love. Flag what you forgot about."
            />

            {subscriptions.length === 0 ? (
              <div style={{ ...S.card, padding: 24, textAlign: 'center' as const, marginBottom: 20 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#f8f8ff', marginBottom: 6 }}>No recurring charges detected</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Clean slate. Let's keep it that way.</div>
              </div>
            ) : (
              <>
                {/* Summary bar */}
                {(() => {
                  const keepSubs = subscriptions.filter(s => s.keepFlag)
                  const totalAnnual = keepSubs.reduce((a, s) => a + s.annualCost, 0)
                  const totalMonthly = keepSubs.reduce((a, s) => a + (s.annualCost / 12), 0)
                  const flagged = subscriptions.filter(s => !s.keepFlag).length
                  return (
                    <div style={{ ...S.card, padding: 18, marginBottom: 20, background: 'linear-gradient(135deg, rgba(124,58,237,0.1), rgba(13,13,36,0.9))' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, textAlign: 'center' as const }}>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', marginBottom: 4 }}>SUBSCRIPTIONS</div>
                          <div style={{ fontSize: 22, fontWeight: 900, color: '#f8f8ff' }}>{subscriptions.length}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', marginBottom: 4 }}>PER MONTH</div>
                          <div style={{ fontSize: 22, fontWeight: 900, color: '#ef4444' }}>${totalMonthly.toFixed(0)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', marginBottom: 4 }}>PER YEAR</div>
                          <div style={{ fontSize: 22, fontWeight: 900, color: '#ef4444' }}>${totalAnnual.toFixed(0)}</div>
                        </div>
                      </div>
                      {flagged > 0 && (
                        <div style={{ marginTop: 14, padding: '8px 12px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, fontSize: 12, color: '#10b981', textAlign: 'center' as const }}>
                          🎉 Flagging {flagged} subscription{flagged > 1 ? 's' : ''} saves you ${subscriptions.filter(s => !s.keepFlag).reduce((a, s) => a + s.annualCost / 12, 0).toFixed(0)}/mo
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Subscription cards */}
                <div style={{ marginBottom: 20 }}>
                  {subscriptions.map((sub, i) => {
                    const vaultColors: Record<string, string> = {
                      essentials: 'rgba(16,185,129,0.08)',
                      debt: 'rgba(245,158,11,0.08)',
                      future: 'rgba(99,102,241,0.08)',
                      lifestyle: 'rgba(236,72,153,0.08)',
                    }
                    const vaultBorderColors: Record<string, string> = {
                      essentials: 'rgba(16,185,129,0.2)',
                      debt: 'rgba(245,158,11,0.2)',
                      future: 'rgba(99,102,241,0.2)',
                      lifestyle: 'rgba(236,72,153,0.2)',
                    }
                    const vaultLabels: Record<string, string> = {
                      essentials: 'Essentials',
                      debt: 'Debt',
                      future: 'Future',
                      lifestyle: 'Lifestyle',
                    }
                    return (
                      <div
                        key={sub.id}
                        style={{
                          ...S.card,
                          padding: '14px 16px',
                          marginBottom: 8,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          opacity: sub.keepFlag ? 1 : 0.45,
                          transition: 'opacity 0.2s',
                        }}
                      >
                        {/* Emoji */}
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: vaultColors[sub.vaultCategory], border: `1px solid ${vaultBorderColors[sub.vaultCategory]}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                          {sub.emoji}
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#f8f8ff', marginBottom: 2 }}>{sub.merchantName}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{sub.frequencyLabel}</span>
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>·</span>
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: vaultColors[sub.vaultCategory], color: Object.entries({ essentials: '#10b981', debt: '#f59e0b', future: '#6366f1', lifestyle: '#ec4899' })[['essentials','debt','future','lifestyle'].indexOf(sub.vaultCategory)]?.[1] ?? '#a78bfa' }}>
                              {vaultLabels[sub.vaultCategory]}
                            </span>
                          </div>
                        </div>

                        {/* Amount + toggle */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                          <div style={{ textAlign: 'right' as const }}>
                            <div style={{ fontSize: 14, fontWeight: 800, color: '#f8f8ff' }}>${sub.amount.toFixed(2)}</div>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>${sub.annualCost.toFixed(0)}/yr</div>
                          </div>
                          <button
                            onClick={() => setSubscriptions(ss => ss.map((s, j) => j === i ? { ...s, keepFlag: !s.keepFlag } : s))}
                            style={{
                              width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 16,
                              background: sub.keepFlag ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
                              color: sub.keepFlag ? '#ef4444' : '#10b981',
                              transition: 'all 0.2s',
                            }}
                            title={sub.keepFlag ? 'Flag to cancel' : 'Keep this'}
                          >
                            {sub.keepFlag ? '✕' : '✓'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 20, textAlign: 'center' as const }}>
                  Tap ✕ to flag subscriptions you want to cancel. Maslo will remind you.
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={back} style={S.btnSec}>← Back</button>
              <button onClick={next} style={{ ...S.btn, flex: 1 }}>Continue →</button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Income ──────────────────────────────────────── */}
        {step === 4 && (
          <div>
            <SectionHead emoji="💵" title="Let's talk income." sub="We build your vaults around your guaranteed take-home pay. Don't include bonuses or side income yet." />

            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={S.label}>GUARANTEED MONTHLY TAKE-HOME (AFTER TAX)</label>
                {detectedFields['income'] && (
                  <span style={{
                    fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 4, letterSpacing: '0.05em',
                    background: detectedFields['income'].confidence === 'high' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                    color: detectedFields['income'].confidence === 'high' ? '#10b981' : '#f59e0b',
                  }}>
                    {detectedFields['income'].confidence === 'high' ? '✓ FROM YOUR BANK' : '~ ESTIMATED'}
                  </span>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>$</span>
                <input value={income} onChange={e => setIncome(e.target.value)} placeholder="5,000" type="number" style={{ ...S.input, paddingLeft: 28 }} />
              </div>
              {detectedFields['income'] && (
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>{detectedFields['income'].source}</div>
              )}
            </div>

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

        {/* ── STEP 5: Tax Profile ─────────────────────────────────── */}
        {step === 5 && (
          <div>
            <SectionHead emoji="🧾" title="Let's talk taxes." sub="Most apps ignore this. Maslo doesn't. We'll set aside the right amount every month so April is never a surprise." />

            {/* Employment type */}
            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 10 }}>HOW DO YOU GET PAID?</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
              {([
                { val: 'w2',             icon: '🏢', label: 'W-2 Employee',      desc: 'Employer withholds taxes' },
                { val: '1099',           icon: '💼', label: 'Self-Employed / 1099', desc: 'You pay your own taxes' },
                { val: 'mixed',          icon: '⚡', label: 'Both',               desc: 'W-2 job + freelance/side income' },
                { val: 'business_owner', icon: '🏗️', label: 'Business Owner',    desc: 'LLC, S-Corp, or partnership' },
              ] as { val: EmploymentType; icon: string; label: string; desc: string }[]).map(opt => (
                <div key={opt.val} onClick={() => setEmploymentType(opt.val)} style={{
                  ...S.card, padding: '14px 16px', cursor: 'pointer',
                  border: employmentType === opt.val ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.07)',
                  background: employmentType === opt.val ? 'rgba(124,58,237,0.1)' : '#0d0d24',
                }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{opt.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#f8f8ff', marginBottom: 3 }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>{opt.desc}</div>
                  {employmentType === opt.val && <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 700, marginTop: 6 }}>SELECTED ✓</div>}
                </div>
              ))}
            </div>

            {/* W-2: gross or net? */}
            {(employmentType === 'w2') && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 10 }}>THE INCOME YOU ENTERED — IS IT GROSS OR NET?</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {([
                    { val: 'net',   label: 'Take-home (net)',  desc: 'After taxes already taken out' },
                    { val: 'gross', label: 'Before taxes (gross)', desc: 'What your offer letter says' },
                  ] as { val: IncomeType; label: string; desc: string }[]).map(opt => (
                    <div key={opt.val} onClick={() => setIncomeType(opt.val)} style={{
                      ...S.card, padding: '12px 14px', cursor: 'pointer',
                      border: incomeType === opt.val ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.07)',
                      background: incomeType === opt.val ? 'rgba(124,58,237,0.1)' : '#0d0d24',
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#f8f8ff', marginBottom: 3 }}>{opt.label}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{opt.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Mixed: how much is 1099? */}
            {employmentType === 'mixed' && (
              <div style={{ marginBottom: 20 }}>
                <Field label="MONTHLY SELF-EMPLOYED / FREELANCE INCOME (GROSS)">
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>$</span>
                    <input value={selfEmployedIncome} onChange={e => setSelfEmployedIncome(e.target.value)} placeholder="1,500" type="number" style={{ ...S.input, paddingLeft: 28 }} />
                  </div>
                </Field>
              </div>
            )}

            {/* Filing status */}
            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 10 }}>FILING STATUS</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
              {([
                { val: 'single',           label: 'Single' },
                { val: 'married_joint',    label: 'Married Filing Jointly' },
                { val: 'married_separate', label: 'Married Filing Separately' },
                { val: 'head_of_household',label: 'Head of Household' },
              ] as { val: FilingStatus; label: string }[]).map(opt => (
                <div key={opt.val} onClick={() => setFilingStatus(opt.val)} style={{
                  padding: '10px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  border: filingStatus === opt.val ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.1)',
                  background: filingStatus === opt.val ? 'rgba(124,58,237,0.12)' : 'rgba(255,255,255,0.03)',
                  color: filingStatus === opt.val ? '#a78bfa' : 'rgba(255,255,255,0.6)',
                  textAlign: 'center' as const,
                }}>
                  {opt.label}
                </div>
              ))}
            </div>

            {/* State + dependents */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 20 }}>
              <Field label="STATE OF RESIDENCE">
                <select value={taxState} onChange={e => setTaxState(e.target.value)} style={{ ...S.input, appearance: 'none' as const }}>
                  {US_STATES.map(s => (
                    <option key={s.code} value={s.code}>{s.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="DEPENDENTS">
                <input value={dependents} onChange={e => setDependents(e.target.value)} type="number" min="0" max="10" placeholder="0" style={S.input} />
              </Field>
            </div>

            {/* ── Business Deductions (1099 / mixed / business only) ── */}
            {isSelfEmployed && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>📋 RECURRING BUSINESS DEDUCTIONS</div>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 14, lineHeight: 1.5 }}>
                  These reduce your taxable income automatically every month. Set them once — Maslo tracks them year-round.
                </p>

                {/* Home office */}
                <div style={{ ...S.card, padding: 16, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 18 }}>🏠</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#f8f8ff' }}>Home Office</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>IRS requires exclusive, regular business use</div>
                    </div>
                    {homeOfficeDeduction > 0 && <div style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#10b981' }}>−${homeOfficeDeduction.toFixed(0)}/mo</div>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Field label="RENT (AUTO-FILLED)">
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>$</span>
                        <input value={rent} readOnly style={{ ...S.input, paddingLeft: 28, opacity: 0.5 }} />
                      </div>
                    </Field>
                    <Field label="% USED FOR BUSINESS">
                      <div style={{ position: 'relative' }}>
                        <input value={homeOfficePct} onChange={e => setHomeOfficePct(e.target.value)} placeholder="15" type="number" min="0" max="100" style={{ ...S.input, paddingRight: 28 }} />
                        <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>%</span>
                      </div>
                    </Field>
                  </div>
                </div>

                {/* Vehicle */}
                <div style={{ ...S.card, padding: 16, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 18 }}>🚗</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#f8f8ff' }}>Vehicle</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Mileage @ $0.67/mi (2024 IRS rate) + gas</div>
                    </div>
                    {(mileageDeduction + carDeduction + gasDeduction) > 0 && (
                      <div style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#10b981' }}>−${(mileageDeduction + carDeduction + gasDeduction).toFixed(0)}/mo</div>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Field label="BUSINESS MILES / MONTH">
                      <input value={businessMileage} onChange={e => setBusinessMileage(e.target.value)} placeholder="500" type="number" style={S.input} />
                    </Field>
                    <Field label="GAS (BUSINESS PORTION $)">
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>$</span>
                        <input value={gasMonthly} onChange={e => setGasMonthly(e.target.value)} placeholder="200" type="number" style={{ ...S.input, paddingLeft: 28 }} />
                      </div>
                    </Field>
                    {carTotalPayment > 0 && (
                      <Field label={`CAR PMT BUSINESS USE (${carTotalPayment > 0 ? `$${carTotalPayment.toFixed(0)}/mo total` : ''})`}>
                        <div style={{ position: 'relative' }}>
                          <input value={carBusinessPct} onChange={e => setCarBusinessPct(e.target.value)} placeholder="60" type="number" min="0" max="100" style={{ ...S.input, paddingRight: 28 }} />
                          <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>%</span>
                        </div>
                      </Field>
                    )}
                    {businessMileage && (
                      <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
                          {parseFloat(businessMileage).toLocaleString()} mi × $0.67 = <b style={{ color: '#a78bfa' }}>${mileageDeduction.toFixed(0)}/mo</b>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Phone & Internet */}
                <div style={{ ...S.card, padding: 16, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 18 }}>📱</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#f8f8ff' }}>Phone & Internet</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Business-use % of your monthly bill</div>
                    </div>
                    {phoneDeduction > 0 && <div style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#10b981' }}>−${phoneDeduction.toFixed(0)}/mo</div>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Field label="MONTHLY BILL TOTAL">
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>$</span>
                        <input value={phoneMonthly} onChange={e => setPhoneMonthly(e.target.value)} placeholder="150" type="number" style={{ ...S.input, paddingLeft: 28 }} />
                      </div>
                    </Field>
                    <Field label="% BUSINESS USE">
                      <div style={{ position: 'relative' }}>
                        <input value={phoneBusinessPct} onChange={e => setPhoneBusinessPct(e.target.value)} placeholder="70" type="number" min="0" max="100" style={{ ...S.input, paddingRight: 28 }} />
                        <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>%</span>
                      </div>
                    </Field>
                  </div>
                </div>

                {/* Health Insurance */}
                <div style={{ ...S.card, padding: 16, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 18 }}>🏥</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#f8f8ff' }}>Health Insurance Premiums</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>100% deductible for self-employed</div>
                    </div>
                    {healthBizDeduction > 0 && <div style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#10b981' }}>−${healthBizDeduction.toFixed(0)}/mo</div>}
                  </div>
                  <Field label="MONTHLY PREMIUM">
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>$</span>
                      <input value={healthInsuranceBiz} onChange={e => setHealthInsuranceBiz(e.target.value)} placeholder="400" type="number" style={{ ...S.input, paddingLeft: 28 }} />
                    </div>
                  </Field>
                </div>

                {/* Running deduction total */}
                {totalMonthlyBizDeds > 0 && (
                  <div style={{ padding: '12px 16px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(16,185,129,0.8)', letterSpacing: '0.08em' }}>TOTAL RECURRING DEDUCTIONS</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>Meals, equipment & travel logged on dashboard</div>
                    </div>
                    <div style={{ textAlign: 'right' as const }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: '#10b981' }}>−${totalMonthlyBizDeds.toFixed(0)}/mo</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>−${totalAnnualBizDeds.toFixed(0)}/yr</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Live tax estimate preview */}
            {taxReserveMonthly > 0 && (
              <div style={{ ...S.card, padding: 18, marginBottom: 20, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(239,68,68,0.7)', letterSpacing: '0.08em', marginBottom: 12 }}>YOUR TAX RESERVE</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div style={{ textAlign: 'center' as const }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>SET ASIDE / MONTH</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: '#ef4444' }}>${taxReserveMonthly.toLocaleString()}</div>
                  </div>
                  <div style={{ textAlign: 'center' as const }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>EST. ANNUAL TAX BILL</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: '#ef4444' }}>${taxEstimate.annualTaxEstimate.toLocaleString()}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                  {taxEstimate.breakdown.federalIncome > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                      <span>Federal income tax</span><span>${taxEstimate.breakdown.federalIncome.toLocaleString()}/yr</span>
                    </div>
                  )}
                  {taxEstimate.breakdown.selfEmploymentTax > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                      <span>Self-employment tax (15.3%)</span><span>${taxEstimate.breakdown.selfEmploymentTax.toLocaleString()}/yr</span>
                    </div>
                  )}
                  {taxEstimate.breakdown.stateTax > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                      <span>{taxState} state income tax</span><span>${taxEstimate.breakdown.stateTax.toLocaleString()}/yr</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                    <span>Effective rate</span><span>{(taxEstimate.effectiveRate * 100).toFixed(1)}%</span>
                  </div>
                  {taxEstimate.taxSavingsFromDeductions > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 8, padding: '8px 10px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8 }}>
                      <span style={{ color: '#10b981', fontWeight: 600 }}>💰 Saved by deductions</span>
                      <span style={{ color: '#10b981', fontWeight: 700 }}>${taxEstimate.taxSavingsFromDeductions.toLocaleString()}/yr</span>
                    </div>
                  )}
                </div>
                {taxEstimate.needsQuarterlyPayments && (
                  <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: 11, color: '#f59e0b' }}>
                    ⚠️ Quarterly estimated payments due: <b>${taxEstimate.breakdown.quarterlyPayment.toLocaleString()}</b> every Jan · Apr · Jun · Sep
                  </div>
                )}
              </div>
            )}

            {taxReserveMonthly === 0 && (employmentType === 'w2' && incomeType === 'net') && (
              <div style={{ ...S.card, padding: 16, marginBottom: 20, background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <div style={{ fontSize: 13, color: '#10b981', fontWeight: 600 }}>✓ Taxes handled by your employer</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>No reserve needed — your take-home is already after taxes.</div>
              </div>
            )}

            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginBottom: 20, lineHeight: 1.5 }}>
              {taxEstimate.disclaimer}
            </p>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={back} style={S.btnSec}>← Back</button>
              <button onClick={next} style={{ ...S.btn, flex: 1 }}>Continue →</button>
            </div>
          </div>
        )}

        {/* ── STEP 6: Essentials ─────────────────────────────────── */}
        {step === 6 && (
          <div>
            <SectionHead emoji="🏡" title="Fixed essentials." sub="These are your non-negotiable monthly bills. Funded first, every single paycheck." />

            {/* Bank nudges */}
            {bankNudges.map((nudge, i) => (
              <div key={i} style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, fontSize: 12, color: '#f59e0b', marginBottom: 10 }}>
                💬 {nudge}
              </div>
            ))}

            <div style={{ ...S.card, padding: 20, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>RENT / MORTGAGE</div>
                {detectedFields['rent'] && (
                  <span style={{
                    fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 4, letterSpacing: '0.05em',
                    background: detectedFields['rent'].confidence === 'high' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                    color: detectedFields['rent'].confidence === 'high' ? '#10b981' : '#f59e0b',
                  }}>
                    {detectedFields['rent'].confidence === 'high' ? '✓ FROM YOUR BANK' : '~ ESTIMATED'}
                  </span>
                )}
              </div>
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
              {detectedFields['rent'] && (
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 6 }}>{detectedFields['rent'].source}</div>
              )}
            </div>

            {/* ── Insurance ── */}
            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>INSURANCE</div>
            {insurances.map((ins, i) => (
              <div key={ins.id} style={{ ...S.card, padding: 20, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#f8f8ff' }}>Insurance #{i + 1}</div>
                    {(ins as any).confidence === 'high' && <span style={{ fontSize: 9, fontWeight: 800, color: '#10b981', background: 'rgba(16,185,129,0.12)', padding: '2px 7px', borderRadius: 99, letterSpacing: '0.06em' }}>✓ FROM YOUR BANK</span>}
                    {(ins as any).confidence === 'medium' && <span style={{ fontSize: 9, fontWeight: 800, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '2px 7px', borderRadius: 99, letterSpacing: '0.06em' }}>~ ESTIMATED</span>}
                  </div>
                  <button onClick={() => setInsurances(ii => ii.filter(x => x.id !== ins.id))} style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.7)', cursor: 'pointer', fontSize: 13 }}>Remove</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 10 }}>
                  <Field label="TYPE">
                    <select value={ins.type} onChange={e => setInsurances(ii => ii.map(x => x.id === ins.id ? { ...x, type: e.target.value } : x))} style={S.input}>
                      <option value="Car">Car</option>
                      <option value="Health">Health</option>
                      <option value="Dental">Dental</option>
                      <option value="Vision">Vision</option>
                      <option value="Life">Life</option>
                      <option value="Renters">Renters</option>
                      <option value="Homeowners">Homeowners</option>
                      <option value="Business">Business</option>
                      <option value="Disability">Disability</option>
                      <option value="Other">Other</option>
                    </select>
                  </Field>
                  <Field label="MONTHLY AMOUNT">
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>$</span>
                      <input value={ins.amount} onChange={e => setInsurances(ii => ii.map(x => x.id === ins.id ? { ...x, amount: e.target.value } : x))} placeholder="0" type="number" style={{ ...S.input, paddingLeft: 28 }} />
                    </div>
                  </Field>
                  <Field label="DUE">
                    <select value={ins.due_day} onChange={e => setInsurances(ii => ii.map(x => x.id === ins.id ? { ...x, due_day: e.target.value } : x))} style={S.input}>
                      {Array.from({ length: 28 }, (_, j) => j + 1).map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </Field>
                </div>
              </div>
            ))}
            <button onClick={() => setInsurances(ii => [...ii, { id: crypto.randomUUID(), type: 'Car', amount: '', due_day: '1' }])} style={{ ...S.btnSec, width: '100%', marginBottom: 20 }}>+ Add Insurance Policy</button>

            <div style={{ ...S.card, padding: 20, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>GROCERIES</div>
                {detectedFields['groceries']?.confidence === 'high' && <span style={{ fontSize: 9, fontWeight: 800, color: '#10b981', background: 'rgba(16,185,129,0.12)', padding: '2px 7px', borderRadius: 99, letterSpacing: '0.06em' }}>✓ FROM YOUR BANK</span>}
                {detectedFields['groceries']?.confidence === 'medium' && <span style={{ fontSize: 9, fontWeight: 800, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '2px 7px', borderRadius: 99, letterSpacing: '0.06em' }}>~ ESTIMATED</span>}
              </div>
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

            {/* ── Utilities (dynamic list) ── */}
            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>UTILITIES</div>
            {bankLinked && utilityList.length > 0 && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#10b981' }}>✓</span> Pre-filled from your bank — review and adjust as needed
              </div>
            )}
            {utilityList.map((u) => (
              <div key={u.id} style={{ ...S.card, padding: 16, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {u.confidence && (
                      <span style={{
                        fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 4, letterSpacing: '0.05em',
                        background: u.confidence === 'high' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                        color: u.confidence === 'high' ? '#10b981' : '#f59e0b',
                      }}>
                        {u.confidence === 'high' ? '✓ FROM YOUR BANK' : '~ ESTIMATED'}
                      </span>
                    )}
                  </div>
                  <button onClick={() => setUtilityList(ll => ll.filter(x => x.id !== u.id))} style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.7)', cursor: 'pointer', fontSize: 12 }}>Remove</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <Field label="TYPE">
                    <select value={u.type} onChange={e => setUtilityList(ll => ll.map(x => x.id === u.id ? { ...x, type: e.target.value } : x))} style={S.input}>
                      {['Electric','Water','Gas / Heat','WiFi / Internet','Phone','Trash','HOA','Sewer','Other'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="AMOUNT / MO">
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>$</span>
                      <input value={u.amount} onChange={e => setUtilityList(ll => ll.map(x => x.id === u.id ? { ...x, amount: e.target.value } : x))} type="number" placeholder="120" style={{ ...S.input, paddingLeft: 24 }} />
                    </div>
                  </Field>
                  <Field label="DUE DATE">
                    <select value={u.due_day} onChange={e => setUtilityList(ll => ll.map(x => x.id === u.id ? { ...x, due_day: e.target.value } : x))} style={S.input}>
                      {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                        <option key={d} value={d}>{d}{[11,12,13].includes(d) ? 'th' : d%10===1 ? 'st' : d%10===2 ? 'nd' : d%10===3 ? 'rd' : 'th'}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                {u.source && (
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 6 }}>{u.source}</div>
                )}
              </div>
            ))}
            <button
              onClick={() => setUtilityList(ll => [...ll, { id: crypto.randomUUID(), type: 'Electric', amount: '', due_day: '1' }])}
              style={{ ...S.btnSec, width: '100%', marginBottom: 16 }}
            >+ Add Utility</button>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={back} style={S.btnSec}>← Back</button>
              <button onClick={next} style={{ ...S.btn, flex: 1 }}>Continue →</button>
            </div>
          </div>
        )}

        {/* ── STEP 7: Debt ────────────────────────────────────────── */}
        {step === 7 && (
          <div>
            <SectionHead emoji="💳" title="Let's kill your debt." sub="Maslo attacks highest interest rate first — the avalanche method. Every dollar above minimum goes to the most expensive debt." />

            {/* ── Car payments ── */}
            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>CAR PAYMENTS</div>
            {cars.map((car, i) => (
              <div key={car.id} style={{ ...S.card, padding: 20, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#f8f8ff' }}>Car #{i + 1}</div>
                    {(car as any).confidence === 'high' && <span style={{ fontSize: 9, fontWeight: 800, color: '#10b981', background: 'rgba(16,185,129,0.12)', padding: '2px 7px', borderRadius: 99, letterSpacing: '0.06em' }}>✓ FROM YOUR BANK</span>}
                    {(car as any).confidence === 'medium' && <span style={{ fontSize: 9, fontWeight: 800, color: '#f59e0b', background: 'rgba(245,158,11,0.12)', padding: '2px 7px', borderRadius: 99, letterSpacing: '0.06em' }}>~ ESTIMATED</span>}
                  </div>
                  <button onClick={() => setCars(cc => cc.filter(x => x.id !== car.id))} style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.7)', cursor: 'pointer', fontSize: 13 }}>Remove</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <Field label="PAYMENT TYPE">
                    <select value={car.type} onChange={e => setCars(cc => cc.map(x => x.id === car.id ? { ...x, type: e.target.value as any } : x))} style={S.input}>
                      <option value="loan">Loan</option>
                      <option value="lease">Lease</option>
                      <option value="rent">Rent-to-Own</option>
                    </select>
                  </Field>
                  <Field label="DUE DATE">
                    <select value={car.due_day} onChange={e => setCars(cc => cc.map(x => x.id === car.id ? { ...x, due_day: e.target.value } : x))} style={S.input}>
                      {Array.from({ length: 28 }, (_, j) => j + 1).map(d => <option key={d} value={d}>{d}{d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'}</option>)}
                    </select>
                  </Field>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="MONTHLY PAYMENT">
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>$</span>
                      <input value={car.amount} onChange={e => setCars(cc => cc.map(x => x.id === car.id ? { ...x, amount: e.target.value } : x))} placeholder="417" type="number" style={{ ...S.input, paddingLeft: 28 }} />
                    </div>
                  </Field>
                  <Field label="LENDER (for auto-matching)">
                    <input value={car.lender} onChange={e => setCars(cc => cc.map(x => x.id === car.id ? { ...x, lender: e.target.value } : x))} placeholder="Honda Financial, Ally…" style={S.input} />
                  </Field>
                </div>
              </div>
            ))}
            <button onClick={() => setCars(cc => [...cc, { id: crypto.randomUUID(), type: 'loan', amount: '', due_day: '7', lender: '' }])} style={{ ...S.btnSec, width: '100%', marginBottom: 20 }}>+ Add Car Payment</button>

            {/* ── Other debts ── */}
            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>OTHER DEBTS</div>
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

        {/* ── STEP 8: The Balance Sheet ───────────────────────────── */}
        {step === 8 && (
          <div>
            <SectionHead emoji="✨" title="Here's the math." sub="Your income flows through two phases. First we get you fit. Then we build muscle." />

            {/* ── Phase 1: The Foundation ── */}
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', marginBottom: 10 }}>PHASE 1 — THE FOUNDATION</div>
            <div style={{ ...S.card, padding: 20, marginBottom: 8, background: 'linear-gradient(135deg, rgba(124,58,237,0.1), rgba(13,13,36,0.9))' }}>
              {/* Income row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em' }}>MONTHLY INCOME</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#10b981', marginTop: 2 }}>${monthlyIncome.toLocaleString()}</div>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>per month</div>
              </div>

              {/* Essentials row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, background: 'rgba(16,185,129,0.12)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>🏡</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#f8f8ff' }}>Essentials</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>rent · groceries · utilities · insurance</div>
                  </div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#ef4444' }}>−${essentialsTotal.toLocaleString()}</div>
              </div>

              {/* Debt row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 32, height: 32, background: 'rgba(245,158,11,0.12)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>💳</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#f8f8ff' }}>Debt Payments</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>cars · loans · credit cards</div>
                  </div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#ef4444' }}>−${debtTotal.toLocaleString()}</div>
              </div>

              {/* Tax reserve row (only shows if non-zero) */}
              {taxReserveMonthly > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, background: 'rgba(239,68,68,0.12)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>🧾</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#f8f8ff' }}>Tax Reserve</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{(taxEstimate.effectiveRate * 100).toFixed(1)}% effective · {taxEstimate.needsQuarterlyPayments ? 'quarterly payments' : 'withheld by employer'}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#ef4444' }}>−${taxReserveMonthly.toLocaleString()}</div>
                </div>
              )}

              {/* Foundation remainder */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>AVAILABLE FOR YOUR FUTURE</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: foundationRemainder >= 0 ? '#a78bfa' : '#ef4444' }}>
                  ${Math.abs(foundationRemainder).toLocaleString()}
                  {foundationRemainder < 0 && <span style={{ fontSize: 12, color: '#ef4444', marginLeft: 6 }}>over</span>}
                </div>
              </div>
            </div>

            {foundationRemainder < 0 && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#fca5a5', lineHeight: 1.5 }}>
                ⚠️ Your essentials and debt alone exceed your income by <b>${Math.abs(foundationRemainder).toLocaleString()}/mo</b>. Before planning for the future, we need to address this gap.
              </div>
            )}

            {/* ── Maslo Philosophy Disclaimer ── */}
            <div style={{ ...S.card, padding: 20, marginBottom: 24, background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 16 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>💪</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#a78bfa', marginBottom: 6, letterSpacing: '0.02em' }}>HOW MASLO WORKS</div>
                  <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                    Maslo is designed to get you <b style={{ color: '#f8f8ff' }}>financially fit</b> before financially free. We lock in your essentials and attack your debt first — because you can't build real wealth on a cracked foundation.
                  </p>
                  <p style={{ margin: '10px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                    Once your debt is cleared and your emergency fund is fully loaded, Maslo <b style={{ color: '#f8f8ff' }}>unlocks goal mode</b> — and every dollar below gets its full power.
                  </p>
                  {unlockMonths > 0 && (
                    <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(124,58,237,0.12)', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>🚀</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa' }}>
                        Projected Goal Mode Unlock: <span style={{ color: '#f8f8ff' }}>{unlockDateStr}</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Phase 2: The Future (aspirational, gated) ── */}
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', marginBottom: 10 }}>PHASE 2 — BUILD MUSCLE</div>

            {/* Live allocation tracker */}
            <div style={{ ...S.card, padding: 18, marginBottom: 20, border: futureOverAllocated ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', marginBottom: 4 }}>AVAILABLE TO ALLOCATE</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#a78bfa' }}>${futureAvailable.toLocaleString()}<span style={{ fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>/mo</span></div>
                </div>
                <div style={{ textAlign: 'right' as const }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', marginBottom: 4 }}>
                    {futureOverAllocated ? 'OVER BY' : 'UNALLOCATED'}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: futureOverAllocated ? '#ef4444' : futureRemaining === 0 ? '#10b981' : '#f8f8ff' }}>
                    {futureOverAllocated ? '+' : ''}${Math.abs(futureRemaining).toLocaleString()}
                    {!futureOverAllocated && futureRemaining > 0 && <span style={{ fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>/mo</span>}
                  </div>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${futureAllocPct}%`,
                  background: futureOverAllocated ? '#ef4444' : futureRemaining === 0 ? '#10b981' : 'linear-gradient(90deg, #7c3aed, #a78bfa)',
                  borderRadius: 99,
                  transition: 'width 0.3s ease, background 0.3s ease',
                }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                <span>${futureAllocated.toLocaleString()} allocated</span>
                {!futureOverAllocated && futureRemaining > 0 && (
                  <span style={{ color: 'rgba(167,139,250,0.6)' }}>→ ${futureRemaining.toLocaleString()} becomes Fun Money 🎉</span>
                )}
                {futureRemaining === 0 && <span style={{ color: '#10b981' }}>Every dollar has a job ✓</span>}
                {futureOverAllocated && <span style={{ color: '#ef4444' }}>Reduce your allocations by ${Math.abs(futureRemaining).toLocaleString()}</span>}
              </div>
            </div>

            {/* Emergency Fund */}
            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 10 }}>🛟 EMERGENCY FUND</div>
            <div style={{ ...S.card, padding: 20, marginBottom: 16 }}>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                Target: <b style={{ color: '#a78bfa' }}>${(monthlyNut * 3).toLocaleString()}</b> (3 months of expenses)
                {efCurrent > 0 && <span style={{ color: 'rgba(255,255,255,0.35)' }}> · You have ${efCurrent.toLocaleString()} saved</span>}
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
              {efMonthlyAmt > 0 && efRemaining > 0 && (
                <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                  At ${efMonthlyAmt.toLocaleString()}/mo → fully funded in <b style={{ color: '#a78bfa' }}>{efMonthsNeeded} months</b>
                </div>
              )}
            </div>

            {/* Savings Goals */}
            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 10 }}>🎯 SAVINGS GOALS</div>
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
                  <div style={{ fontSize: 12, color: '#a78bfa', marginTop: 6 }}>
                    = ${(parseFloat(g.target) / Math.max(parseInt(g.months),1)).toFixed(0)}/month
                    {unlockMonths > 0 && <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>· starts ~{unlockDateStr}</span>}
                  </div>
                )}
                <button onClick={() => removeGoal(g.id)} style={{ background: 'none', border: 'none', color: 'rgba(239,68,68,0.6)', cursor: 'pointer', fontSize: 12, marginTop: 8, padding: 0 }}>Remove goal</button>
              </div>
            ))}
            <button onClick={addGoal} style={{ ...S.btnSec, width: '100%', marginBottom: 16 }}>+ Add Savings Goal</button>

            {/* Investments */}
            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 10 }}>📈 INVESTMENTS</div>
            <div style={{ ...S.card, padding: 20, marginBottom: 12 }}>
              {investments.map((inv, i) => (
                <div key={i} style={{ marginBottom: i < investments.length - 1 ? 16 : 0 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 10, alignItems: 'flex-end' }}>
                    <Field label="TYPE">
                      <input value={inv.type} onChange={e => setInvestments(ii => ii.map((x, j) => j === i ? { ...x, type: e.target.value } : x))} style={S.input} />
                    </Field>
                    <Field label="MONTHLY AMOUNT">
                      <div style={{ position: 'relative' }}>
                        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>$</span>
                        <input value={inv.amount} onChange={e => setInvestments(ii => ii.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} placeholder="0" type="number" style={{ ...S.input, paddingLeft: 28 }} />
                      </div>
                    </Field>
                    {investments.length > 1 && (
                      <button
                        onClick={() => setInvestments(ii => ii.filter((_, j) => j !== i))}
                        style={{ padding: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'rgba(255,100,100,0.7)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                      >✕</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setInvestments(ii => [...ii, { type: '', amount: '' }])}
              style={{ ...S.btnSec, width: '100%', marginBottom: 24 }}
            >+ Add Investment Vehicle</button>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={back} style={S.btnSec}>← Back</button>
              <button
                onClick={next}
                disabled={futureOverAllocated}
                style={{ ...S.btn, flex: 1, opacity: futureOverAllocated ? 0.4 : 1, cursor: futureOverAllocated ? 'not-allowed' : 'pointer' }}
              >
                {futureOverAllocated ? `Over by $${Math.abs(futureRemaining).toLocaleString()} — adjust above` : 'Continue →'}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 9: Personality ─────────────────────────────────── */}
        {step === 9 && (
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

        {/* ── STEP 10: Vault preview + confirm ────────────────────── */}
        {step === 10 && (
          <div>
            <SectionHead emoji="🔐" title="Your vault system." sub="Here's how Maslo will structure your money. Review and activate." />

            {/* Vault preview */}
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, marginBottom: 24 }}>
              {[
                { label: 'ESSENTIALS', color: '#3b82f6', items: [
                  rent && { name: 'Rent', icon: '🏡', amount: parseFloat(rent), due: rentDue },
                  groceries && { name: 'Groceries', icon: '🛒', amount: parseFloat(groceries) },
                  ...utilityList.filter(u => parseFloat(u.amount) > 0).map(u => ({ name: u.type, icon: ({'Electric':'⚡','Water':'💧','Gas / Heat':'🔥','WiFi / Internet':'📶','Phone':'📱','Trash':'🗑️','HOA':'🏘️','Sewer':'🚿'} as Record<string,string>)[u.type] ?? '🔌', amount: parseFloat(u.amount), due: u.due_day })),
                  ...insurances.filter(i => parseFloat(i.amount) > 0).map(i => ({ name: `${i.type} Insurance`, icon: '🛡️', amount: parseFloat(i.amount), due: i.due_day })),
                ].filter(Boolean) },
                { label: 'DEBT', color: '#ef4444', items: [
                  ...cars.filter(c => parseFloat(c.amount) > 0).map(c => ({ name: `${c.type === 'loan' ? 'Car Loan' : c.type === 'lease' ? 'Car Lease' : 'Car Rent-to-Own'}${c.lender ? ` — ${c.lender}` : ''}`, icon: '🚗', amount: parseFloat(c.amount) })),
                  ...debts.map(d => ({ name: d.lender, icon: '💳', amount: parseFloat(d.min_payment) || 0 })),
                ] },
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
                        <span style={{ fontSize: 13, color: '#f8f8ff' }}>{item.icon} {item.name}{item.due ? ` · due ${item.due}${[11,12,13].includes(parseInt(item.due)) ? 'th' : parseInt(item.due) % 10 === 1 ? 'st' : parseInt(item.due) % 10 === 2 ? 'nd' : parseInt(item.due) % 10 === 3 ? 'rd' : 'th'}` : ''}</span>
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
