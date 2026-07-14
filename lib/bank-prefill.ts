// ─── Maslo Bank Pre-fill Engine ──────────────────────────────────────────────
// Analyzes 180 days of Stripe Financial Connections transactions.
// Uses Stripe's own category field as the primary signal, then falls back to
// cleaned description regex — per the Merchant Normalization Engine spec
// (Section 17 of MASLO_CONTEXT_4.md).
//
// Confidence levels:
//   high   → Stripe category match + keyword match + 3+ occurrences
//   medium → one signal (category only, or keyword only, or <3 occurrences)

export type Confidence = 'high' | 'medium'
export type Freq = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'

export interface RawFCTransaction {
  id: string
  date: string       // YYYY-MM-DD or Unix timestamp (we handle both)
  amount: number     // signed dollars: negative = income/credit, positive = expense/debit
  description: string
  category?: string  // Stripe FC category (e.g. 'bill_payment', 'transfer', 'purchase')
  subcategory?: string
}

export interface PrefillField {
  value: string
  confidence: Confidence
  source: string
}

export interface PrefillEntry {
  type: string
  amount: string
  due_day: string
  confidence: Confidence
  source: string
}

export interface CarPrefillEntry {
  type: 'loan' | 'lease' | 'rent'
  amount: string
  due_day: string
  lender: string
  confidence: Confidence
  source: string
}

export interface BankPrefillResult {
  income?:      PrefillField & { freq: Freq }
  rent?:        PrefillField
  utilities:    PrefillEntry[]
  insurances:   PrefillEntry[]
  cars:         CarPrefillEntry[]
  groceries?:   PrefillField
  gasStations?: PrefillField
  nudges:       string[]
}

// ── Step 1: Merchant Normalization — strip bank noise from raw descriptions ───
// Per Section 17: "Clean Raw Description — strip prefixes: POS, PURCHASE AUTH,
// DEBIT. Normalize spacing, symbols, casing."
function cleanDescription(raw: string): string {
  return raw
    .replace(/^(purchase\s+auth\s*#?\d*|pos\s+purchase|pos\s+debit|debit\s+card|ach\s+debit|ach\s+credit|preauth|recurring\s+charge|autopay|online\s+pmt|payment\s+thank\s+you|web\s+pmnt|web\s+pay|checkcard|visa\s+(?:debit|purchase)|mc\s+debit)\s*/i, '')
    .replace(/\s+(#\d+|ref\s*#?\s*\d+|\d{4,})\s*$/i, '')  // strip trailing store numbers
    .replace(/[*]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toLowerCase()
}

// ── Stripe FC category → intent map ─────────────────────────────────────────
// Stripe's category field gives us intent before we even look at description.
const STRIPE_CATEGORY_INTENT: Record<string, string> = {
  'bill_payment':    'bill',       // rent, car payment, utilities, insurance
  'transfer':        'transfer',   // income, internal moves
  'direct_debit':    'bill',       // recurring autopay bills
  'purchase':        'purchase',   // retail / discretionary
  'other':           'unknown',
}

// ── Keyword patterns (run on CLEANED descriptions) ───────────────────────────
const PATTERNS = {
  income: [
    /payroll/i, /salary/i, /direct\s*dep/i, /gusto/i, /adp/i,
    /paychex/i, /intuit\s*payroll/i, /zelle/i, /venmo/i, /cashapp/i,
    /cash\s*app/i, /doordash/i, /uber/i, /lyft/i, /stripe\s*payout/i,
    /square\s*payout/i, /shopify\s*payout/i,
  ],
  rent: [
    /rent/i, /apartment/i, /realty/i, /propert/i, /mgmt/i, /management/i,
    /housing/i, /landlord/i, /residential/i, /leasing/i, /hoa/i,
    /greystar/i, /equity\s*res/i, /camden/i, /aimco/i, /building/i,
    /complex/i, /tenant/i,
  ],
  electric: [
    /electric/i, /duke\s*energy/i, /con\s*ed/i, /pge/i, /pg&e/i, /fpl/i,
    /entergy/i, /ameren/i, /dominion/i, /xcel/i, /southern\s*company/i,
    /aps/i, /salt\s*river/i, /evergy/i, /eversource/i, /national\s*grid/i,
    /comed/i, /pso/i, /pseg/i, /jcp&l/i, /nj\s*power/i,
  ],
  water: [
    /water/i, /sewer/i, /municipal\s*util/i, /city\s*of/i,
    /public\s*util/i, /dept\s*of\s*water/i, /water\s*district/i,
  ],
  gas_heat: [
    /atmos/i, /nicor/i, /peoples\s*gas/i, /centerpoint/i, /national\s*fuel/i,
    /laclede/i, /southwest\s*gas/i, /piedmont\s*natural/i, /spire/i,
    /avangrid/i, /wgl/i, /natural\s*gas/i, /elizabethtown\s*gas/i,
    /new\s*jersey\s*natural/i, /njng/i, /south\s*jersey\s*gas/i,
  ],
  internet: [
    /comcast/i, /xfinity/i, /spectrum/i, /cox\s*comm/i, /at&t\s*internet/i,
    /frontier/i, /optimum/i, /altice/i, /centurylink/i, /lumen/i,
    /windstream/i, /mediacom/i, /wow\s*internet/i, /astound/i, /breezeline/i,
    /fios/i, /verizon\s*fios/i,
  ],
  phone: [
    /at&t/i, /verizon/i, /t-mobile/i, /tmobile/i, /sprint/i, /cricket/i,
    /metro\s*by/i, /boost\s*mobile/i, /us\s*cellular/i, /visible/i,
    /mint\s*mobile/i, /consumer\s*cellular/i, /straight\s*talk/i,
  ],
  trash: [
    /waste\s*management/i, /republic\s*services/i, /veolia/i,
    /trash/i, /garbage/i, /sanitation/i,
  ],
  insurance: [
    /geico/i, /progressive/i, /state\s*farm/i, /allstate/i, /usaa/i,
    /liberty\s*mutual/i, /nationwide/i, /farmers/i, /travelers/i, /amica/i,
    /auto\s*owners/i, /erie\s*ins/i, /blue\s*cross/i, /bcbs/i, /aetna/i,
    /cigna/i, /humana/i, /united\s*health/i, /kaiser/i, /anthem/i, /molina/i,
    /insurance/i, /ins\s*pmt/i, /oscar\s*health/i,
  ],
  car_payment: [
    /ally/i, /toyota\s*fin/i, /honda\s*fin/i, /ford\s*motor/i,
    /gm\s*financial/i, /chase\s*auto/i, /capital\s*one\s*auto/i,
    /carmax\s*auto/i, /hyundai\s*motor/i, /kia\s*motors/i, /bmw\s*fin/i,
    /mercedes\s*fin/i, /tesla\s*fin/i, /nissan\s*motor/i, /subaru\s*motors/i,
    /chrysler\s*cap/i, /vw\s*credit/i, /volvo\s*fin/i, /auto\s*loan/i,
    /car\s*payment/i, /vehicle\s*loan/i, /auto\s*pmt/i, /wells\s*fargo\s*auto/i,
    /santander\s*auto/i, /td\s*auto/i, /usaa\s*auto/i,
  ],
  groceries: [
    /whole\s*foods/i, /trader\s*joe/i, /safeway/i, /kroger/i, /publix/i,
    /aldi/i, /wegmans/i, /sprouts/i, /heb\b/i, /meijer/i, /stop\s*&\s*shop/i,
    /giant/i, /food\s*lion/i, /harris\s*teeter/i, /ralphs/i, /vons/i,
    /jewel/i, /albertsons/i, /winn\s*dixie/i, /market\s*basket/i,
    /stater\s*bros/i, /walmart\s*supercenter/i, /costco/i, /sam.s\s*club/i,
    /bj.s\s*wholesale/i, /grocery/i, /supermarket/i, /food\s*mart/i,
  ],
  gas_station: [
    /shell/i, /chevron/i, /\bbp\b/i, /exxon/i, /mobil/i, /sunoco/i,
    /speedway/i, /casey.s/i, /quiktrip/i, /racetrac/i, /wawa/i, /sheetz/i,
    /circle\s*k/i, /7-eleven/i, /kwik\s*trip/i, /marathon/i, /valero/i,
    /pilot/i, /flying\s*j/i, /loves\s*travel/i, /texaco/i,
  ],
}

function matches(desc: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(desc))
}

// ── Recurring detection helpers ───────────────────────────────────────────────
interface TxGroup {
  description: string
  cleanedDesc: string
  amounts: number[]
  dates: string[]
  stripeCategory?: string
}

function normalizeDate(raw: string | number): string {
  if (typeof raw === 'number') {
    return new Date(raw * 1000).toISOString().slice(0, 10)
  }
  return String(raw).slice(0, 10)
}

function groupRecurring(
  txs: RawFCTransaction[],
  patterns: RegExp[],
  minOccurrences = 2,
  stripeCategories?: string[],
): TxGroup[] {
  const expenses = txs.filter(tx => tx.amount > 0)

  const keywordMatched  = expenses.filter(tx => matches(cleanDescription(tx.description), patterns))
  const categoryMatched = stripeCategories
    ? expenses.filter(tx => tx.category && stripeCategories.includes(tx.category) && !keywordMatched.includes(tx))
    : []

  const allMatched = [...keywordMatched, ...categoryMatched]

  const groups = new Map<string, TxGroup>()
  for (const tx of allMatched) {
    const cleaned = cleanDescription(tx.description)
    const key = cleaned.slice(0, 28)
    if (!groups.has(key)) {
      groups.set(key, {
        description: tx.description,
        cleanedDesc: cleaned,
        amounts: [],
        dates: [],
        stripeCategory: tx.category ?? undefined,
      })
    }
    const g = groups.get(key)!
    g.amounts.push(tx.amount)
    g.dates.push(normalizeDate(tx.date))
  }

  return [...groups.values()].filter(g => g.amounts.length >= minOccurrences)
}

function avgAmount(amounts: number[]): number {
  return amounts.reduce((a, b) => a + b, 0) / amounts.length
}

function mostCommonDueDay(dates: string[]): string {
  const days = dates.map(d => new Date(d).getDate())
  const counts = new Map<number, number>()
  days.forEach(d => counts.set(d, (counts.get(d) ?? 0) + 1))
  return String([...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 1)
}

function detectFreq(dates: string[]): Freq {
  if (dates.length < 2) return 'monthly'
  const sorted = [...dates].sort()
  const ms = sorted.map(d => new Date(d).getTime())
  const gaps: number[] = []
  for (let i = 1; i < ms.length; i++) gaps.push((ms[i] - ms[i - 1]) / 86400000)
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length
  if (avg <= 8)  return 'weekly'
  if (avg <= 16) return 'biweekly'
  if (avg <= 20) return 'semimonthly'
  return 'monthly'
}

function isConsistentAmount(amounts: number[], threshold = 0.08): boolean {
  if (amounts.length < 2) return false
  const avg = avgAmount(amounts)
  return amounts.every(a => Math.abs(a - avg) / avg <= threshold)
}

// ── Main engine ───────────────────────────────────────────────────────────────
export function analyzeBankData(txs: RawFCTransaction[]): BankPrefillResult {
  // Normalize dates first
  const normalized = txs.map(tx => ({ ...tx, date: normalizeDate(tx.date) }))

  const result: BankPrefillResult = { utilities: [], insurances: [], cars: [], nudges: [] }

  // ── INCOME ──────────────────────────────────────────────────────────────────
  // Credits (negative amounts) > $300. Stripe 'transfer' category = likely income.
  const credits = normalized.filter(tx => tx.amount < 0 && Math.abs(tx.amount) > 300)
  const incomeGroups = new Map<string, { amounts: number[]; dates: string[]; signals: number }>()

  for (const tx of credits) {
    const cleaned = cleanDescription(tx.description)
    const key = cleaned.slice(0, 28)
    if (!incomeGroups.has(key)) incomeGroups.set(key, { amounts: [], dates: [], signals: 0 })
    const g = incomeGroups.get(key)!
    g.amounts.push(Math.abs(tx.amount))
    g.dates.push(tx.date)
    // Count how many signals we have: keyword match + Stripe category
    if (matches(cleaned, PATTERNS.income)) g.signals = Math.max(g.signals, 2)
    else if (tx.category === 'transfer') g.signals = Math.max(g.signals, 1)
  }

  // Sort: keyword matches first, then by avg amount (largest = most likely primary income)
  const incomeCandidates = [...incomeGroups.entries()]
    .filter(([, g]) => g.amounts.length >= 2)
    .sort((a, b) => {
      if (b[1].signals !== a[1].signals) return b[1].signals - a[1].signals
      return avgAmount(b[1].amounts) - avgAmount(a[1].amounts)
    })

  if (incomeCandidates.length > 0) {
    const [key, g] = incomeCandidates[0]
    const freq     = detectFreq(g.dates)
    const perCheck = avgAmount(g.amounts)
    const multipliers: Record<Freq, number> = { weekly: 52/12, biweekly: 26/12, semimonthly: 2, monthly: 1 }
    const monthly  = perCheck * multipliers[freq]
    const confident = isConsistentAmount(g.amounts, 0.08) && g.amounts.length >= 3 && g.signals >= 1

    result.income = {
      value:      String(Math.round(monthly)),
      confidence: confident ? 'high' : 'medium',
      source:     `${key.trim()} · ${g.amounts.length} deposits avg $${Math.round(perCheck)}`,
      freq,
    }
  }

  // ── RENT ────────────────────────────────────────────────────────────────────
  // Stripe 'bill_payment' + rent keywords OR large consistent monthly charge
  const rentGroups = groupRecurring(normalized, PATTERNS.rent, 2, ['bill_payment', 'direct_debit'])
  const rentByKeyword = rentGroups.filter(g => matches(g.cleanedDesc, PATTERNS.rent))
  const rentByCategory = rentGroups.filter(g => !matches(g.cleanedDesc, PATTERNS.rent))

  // Also look for large consistent non-categorized charges ($700-$8k range, 2+ times)
  const largeBills = new Map<string, { amounts: number[]; dates: string[] }>()
  for (const tx of normalized.filter(tx => tx.amount > 700 && tx.amount < 8000)) {
    const key = String(Math.round(tx.amount / 50) * 50) // bucket to nearest $50
    if (!largeBills.has(key)) largeBills.set(key, { amounts: [], dates: [] })
    const g = largeBills.get(key)!
    g.amounts.push(tx.amount)
    g.dates.push(tx.date)
  }
  const largeRecurring = [...largeBills.values()].filter(g => g.amounts.length >= 2 && isConsistentAmount(g.amounts, 0.05))

  if (rentByKeyword.length > 0) {
    const g = rentByKeyword.sort((a, b) => avgAmount(b.amounts) - avgAmount(a.amounts))[0]
    const avg = avgAmount(g.amounts)
    result.rent = {
      value:      String(Math.round(avg)),
      confidence: isConsistentAmount(g.amounts, 0.02) && g.amounts.length >= 2 ? 'high' : 'medium',
      source:     `${g.cleanedDesc.slice(0, 32)} · ${g.amounts.length} charges`,
    }
  } else if (rentByCategory.length > 0) {
    // Stripe said 'bill_payment' but no rent keyword — surface as medium confidence
    const g = rentByCategory.sort((a, b) => avgAmount(b.amounts) - avgAmount(a.amounts))[0]
    const avg = avgAmount(g.amounts)
    if (avg > 400) {
      result.rent = {
        value:      String(Math.round(avg)),
        confidence: 'medium',
        source:     `${g.cleanedDesc.slice(0, 32)} · ${g.amounts.length} charges (category: bill payment)`,
      }
    }
  } else if (largeRecurring.length > 0) {
    // Fallback: largest consistent recurring charge — likely rent
    const g = largeRecurring.sort((a, b) => avgAmount(b.amounts) - avgAmount(a.amounts))[0]
    const avg = avgAmount(g.amounts)
    result.nudges.push(`We noticed a recurring charge of ~$${Math.round(avg)}/mo — is that your rent?`)
  }

  // ── UTILITIES ───────────────────────────────────────────────────────────────
  const utilityDefs: { type: string; patterns: RegExp[] }[] = [
    { type: 'Electric',        patterns: PATTERNS.electric  },
    { type: 'Water',           patterns: PATTERNS.water     },
    { type: 'Gas / Heat',      patterns: PATTERNS.gas_heat  },
    { type: 'WiFi / Internet', patterns: PATTERNS.internet  },
    { type: 'Phone',           patterns: PATTERNS.phone     },
    { type: 'Trash',           patterns: PATTERNS.trash     },
  ]
  for (const def of utilityDefs) {
    const groups = groupRecurring(normalized, def.patterns, 2, ['bill_payment', 'direct_debit'])
    if (groups.length > 0) {
      const g = groups[0]
      const avg = avgAmount(g.amounts)
      result.utilities.push({
        type:       def.type,
        amount:     String(Math.round(avg)),
        due_day:    mostCommonDueDay(g.dates),
        confidence: isConsistentAmount(g.amounts, 0.20) ? 'high' : 'medium',
        source:     `${g.cleanedDesc.slice(0, 32)} · ${g.amounts.length} charges avg $${Math.round(avg)}`,
      })
    }
  }

  // ── INSURANCE ───────────────────────────────────────────────────────────────
  const insGroups = groupRecurring(normalized, PATTERNS.insurance, 2, ['bill_payment', 'direct_debit'])
  const seenInsTypes = new Set<string>()
  for (const g of insGroups) {
    const desc = g.cleanedDesc
    let type = 'Insurance'
    if (/geico|progressive|state\s*farm|allstate|usaa|liberty|nationwide|farmers|travelers/.test(desc)) type = 'Auto'
    else if (/blue\s*cross|bcbs|aetna|cigna|humana|united|kaiser|anthem|oscar/.test(desc)) type = 'Health'
    else if (/life/.test(desc)) type = 'Life'
    else if (/home|renters/.test(desc)) type = 'Renters/Home'

    if (!seenInsTypes.has(type)) {
      seenInsTypes.add(type)
      const avg = avgAmount(g.amounts)
      result.insurances.push({
        type,
        amount:     String(Math.round(avg)),
        due_day:    mostCommonDueDay(g.dates),
        confidence: isConsistentAmount(g.amounts, 0.03) ? 'high' : 'medium',
        source:     `${g.cleanedDesc.slice(0, 32)} · ${g.amounts.length} charges`,
      })
    }
  }

  // ── CAR PAYMENTS ─────────────────────────────────────────────────────────────
  const carGroups = groupRecurring(normalized, PATTERNS.car_payment, 2, ['bill_payment', 'loan_payment', 'direct_debit'])
  for (const g of carGroups) {
    const avg = avgAmount(g.amounts)
    if (avg < 80 || avg > 2500) continue
    const type: 'loan' | 'lease' = /lease/.test(g.cleanedDesc) ? 'lease' : 'loan'
    result.cars.push({
      type,
      amount:     String(Math.round(avg)),
      due_day:    mostCommonDueDay(g.dates),
      lender:     g.cleanedDesc.split(' ').slice(0, 3).join(' '),
      confidence: isConsistentAmount(g.amounts, 0.02) ? 'high' : 'medium',
      source:     `${g.cleanedDesc.slice(0, 32)} · ${g.amounts.length} charges`,
    })
  }

  // ── GROCERIES ────────────────────────────────────────────────────────────────
  const grocTxs = normalized.filter(tx =>
    tx.amount > 0 && (
      matches(cleanDescription(tx.description), PATTERNS.groceries) ||
      tx.category === 'food_and_drink'
    )
  )
  if (grocTxs.length >= 4) {
    const monthlyAvg = grocTxs.reduce((s, t) => s + t.amount, 0) / 6
    result.groceries = {
      value:      String(Math.round(monthlyAvg)),
      confidence: 'medium',
      source:     `${grocTxs.length} grocery charges over 180 days`,
    }
  }

  // ── GAS STATIONS ─────────────────────────────────────────────────────────────
  const gasTxs = normalized.filter(tx =>
    tx.amount > 0 && (
      matches(cleanDescription(tx.description), PATTERNS.gas_station) ||
      tx.category === 'gas'
    )
  )
  if (gasTxs.length >= 3) {
    const monthlyAvg = gasTxs.reduce((s, t) => s + t.amount, 0) / 6
    result.gasStations = {
      value:      String(Math.round(monthlyAvg)),
      confidence: 'medium',
      source:     `${gasTxs.length} gas station charges over 180 days`,
    }
  }

  return result
}
