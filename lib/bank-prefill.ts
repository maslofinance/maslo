// ─── Maslo Bank Pre-fill Engine ──────────────────────────────────────────────
// Analyzes 180 days of Stripe Financial Connections transactions and returns
// pre-filled onboarding values with confidence levels.
// High confidence   = pre-fill silently + green badge
// Medium confidence = pre-fill + yellow "confirm?" badge
// Not detected      = leave blank + conversational nudge

export type Confidence = 'high' | 'medium'
export type Freq = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'

export interface RawFCTransaction {
  id: string
  date: string      // YYYY-MM-DD
  amount: number    // positive = expense (dollars), negative = income
  description: string
}

export interface PrefillField {
  value: string
  confidence: Confidence
  source: string    // human-readable — e.g. "AT&T · 6 charges avg $98"
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
  nudges:       string[]   // fields Maslo partially detected but needs confirmation
}

// ── Merchant pattern matchers ─────────────────────────────────────────────────
const PATTERNS = {
  income: [
    /direct\s*dep/i, /payroll/i, /salary/i, /ach\s*credit/i,
    /gusto/i, /adp/i, /paychex/i, /intuit\s*payroll/i, /zelle/i,
  ],
  rent: [
    /rent/i, /apartment/i, /realty/i, /properties/i, /management/i,
    /housing/i, /landlord/i, /residential/i, /leasing/i, /hoa/i,
    /greystar/i, /equity\s*residential/i, /camden/i, /aimco/i,
  ],
  electric: [
    /electric/i, /duke\s*energy/i, /con\s*ed/i, /pge/i, /pg&e/i,
    /fpl/i, /entergy/i, /ameren/i, /dominion/i, /xcel\s*energy/i,
    /southern\s*company/i, /aps/i, /salt\s*river/i, /evergy/i,
    /eversource/i, /national\s*grid/i, /comed/i, /pso/i,
  ],
  water: [
    /water/i, /sewer/i, /municipal\s*util/i, /city\s*of/i,
    /public\s*util/i, /dept\s*of\s*water/i, /water\s*district/i,
  ],
  gas_heat: [
    /atmos/i, /nicor/i, /peoples\s*gas/i, /centerpoint/i,
    /national\s*fuel/i, /laclede/i, /southwest\s*gas/i,
    /piedmont\s*natural/i, /new\s*jersey\s*resources/i, /spire/i,
    /avangrid/i, /energynorth/i, /wgl/i, /natural\s*gas/i,
  ],
  internet: [
    /comcast/i, /xfinity/i, /spectrum/i, /cox\s*comm/i,
    /at&t\s*internet/i, /frontier/i, /optimum/i, /altice/i,
    /centurylink/i, /lumen/i, /windstream/i, /consolidated\s*comm/i,
    /mediacom/i, /wow\s*internet/i, /astound/i, /breezeline/i,
  ],
  phone: [
    /at&t/i, /verizon/i, /t-mobile/i, /tmobile/i, /sprint/i,
    /cricket/i, /metro\s*by/i, /boost\s*mobile/i, /us\s*cellular/i,
    /visible/i, /mint\s*mobile/i, /consumer\s*cellular/i, /straight\s*talk/i,
  ],
  trash: [
    /waste\s*management/i, /republic\s*services/i, /veolia/i,
    /trash/i, /garbage/i, /sanitation/i, /recycle/i,
  ],
  insurance: [
    /geico/i, /progressive/i, /state\s*farm/i, /allstate/i,
    /usaa/i, /liberty\s*mutual/i, /nationwide/i, /farmers/i,
    /travelers/i, /amica/i, /auto\s*owners/i, /erie\s*insurance/i,
    /blue\s*cross/i, /bcbs/i, /aetna/i, /cigna/i, /humana/i,
    /united\s*health/i, /kaiser/i, /anthem/i, /molina/i,
    /insurance/i, /ins\s*pmt/i,
  ],
  car_payment: [
    /toyota\s*fin/i, /honda\s*fin/i, /ford\s*motor\s*credit/i,
    /gm\s*financial/i, /ally\s*financial/i, /chase\s*auto/i,
    /capital\s*one\s*auto/i, /carmax\s*auto/i, /hyundai\s*motor/i,
    /kia\s*motors/i, /bmw\s*financial/i, /mercedes\s*fin/i,
    /tesla\s*finance/i, /nissan\s*motor/i, /subaru\s*motors/i,
    /chrysler\s*cap/i, /vw\s*credit/i, /volvo\s*fin/i,
    /auto\s*loan/i, /car\s*payment/i, /vehicle\s*payment/i,
  ],
  groceries: [
    /whole\s*foods/i, /trader\s*joe/i, /safeway/i, /kroger/i,
    /publix/i, /aldi/i, /wegmans/i, /sprouts/i, /heb/i, /meijer/i,
    /stop\s*&\s*shop/i, /giant/i, /food\s*lion/i, /harris\s*teeter/i,
    /smith's/i, /ralphs/i, /vons/i, /jewel/i, /albertsons/i,
    /winn\s*dixie/i, /piggly/i, /market\s*basket/i, /stater\s*bros/i,
    /walmart\s*grocery/i, /walmart\s*supercenter/i, /costco/i,
    /sam's\s*club/i, /bj's\s*wholesale/i,
  ],
  gas_station: [
    /shell/i, /chevron/i, /bp\b/i, /exxon/i, /mobil/i, /sunoco/i,
    /speedway/i, /casey's/i, /quiktrip/i, /racetrac/i, /wawa/i,
    /sheetz/i, /circle\s*k/i, /7-eleven/i, /kwik\s*trip/i,
    /marathon/i, /valero/i, /pilot/i, /flying\s*j/i, /loves/i,
    /texaco/i, /esso/i,
  ],
}

function matches(desc: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(desc))
}

// ── Recurring detection helpers ───────────────────────────────────────────────
interface TxGroup {
  description: string
  amounts:     number[]
  dates:       string[]
}

function groupRecurring(
  txs: RawFCTransaction[],
  patterns: RegExp[],
  minOccurrences = 2,
): TxGroup[] {
  const expenses = txs.filter(tx => tx.amount > 0)
  const matched  = expenses.filter(tx => matches(tx.description, patterns))

  // Normalize merchant name (strip numbers/noise)
  function normalize(s: string) {
    return s.replace(/[^a-zA-Z\s]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 24)
  }

  const groups = new Map<string, TxGroup>()
  for (const tx of matched) {
    const key = normalize(tx.description)
    if (!groups.has(key)) groups.set(key, { description: tx.description, amounts: [], dates: [] })
    const g = groups.get(key)!
    g.amounts.push(tx.amount)
    g.dates.push(tx.date)
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
  for (let i = 1; i < ms.length; i++) gaps.push((ms[i] - ms[i-1]) / 86400000)
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length
  if (avg <= 8)  return 'weekly'
  if (avg <= 16) return 'biweekly'
  if (avg <= 20) return 'semimonthly'
  return 'monthly'
}

function isConsistentAmount(amounts: number[], threshold = 0.08): boolean {
  const avg = avgAmount(amounts)
  return amounts.every(a => Math.abs(a - avg) / avg <= threshold)
}

// ── Main engine ───────────────────────────────────────────────────────────────
export function analyzeBankData(txs: RawFCTransaction[]): BankPrefillResult {
  const result: BankPrefillResult = {
    utilities:  [],
    insurances: [],
    cars:       [],
    nudges:     [],
  }

  // ── Income ──────────────────────────────────────────────────────────────────
  const credits = txs.filter(tx => tx.amount < 0 && Math.abs(tx.amount) > 300)

  // Pass 1: keyword-matched payroll/direct-deposit sources (high confidence)
  const incomeGroups = new Map<string, { amounts: number[]; dates: string[]; keywordMatch: boolean }>()
  for (const tx of credits) {
    const key = tx.description.slice(0, 24).toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
    if (!incomeGroups.has(key)) incomeGroups.set(key, { amounts: [], dates: [], keywordMatch: false })
    const g = incomeGroups.get(key)!
    g.amounts.push(Math.abs(tx.amount))
    g.dates.push(tx.date)
    if (matches(tx.description, PATTERNS.income)) g.keywordMatch = true
  }

  // Pick the best recurring credit source: keyword matches first, then largest recurring
  const candidates = [...incomeGroups.entries()]
    .filter(([, g]) => g.amounts.length >= 2)
    .sort((a, b) => {
      // keyword matches win; otherwise sort by avg amount descending
      if (a[1].keywordMatch !== b[1].keywordMatch) return a[1].keywordMatch ? -1 : 1
      return avgAmount(b[1].amounts) - avgAmount(a[1].amounts)
    })

  const bestIncome = candidates[0]

  if (bestIncome) {
    const [key, g] = bestIncome
    const freq      = detectFreq(g.dates)
    const perCheck  = avgAmount(g.amounts)
    const multipliers: Record<Freq, number> = { weekly: 52/12, biweekly: 26/12, semimonthly: 2, monthly: 1 }
    const monthly   = perCheck * multipliers[freq]
    const confident = isConsistentAmount(g.amounts, 0.08) && g.amounts.length >= 3
    result.income = {
      value:      String(Math.round(monthly)),
      confidence: (confident && g.keywordMatch) ? 'high' : 'medium',
      source:     `${key.trim()} · ${g.amounts.length} deposits avg $${Math.round(perCheck)}`,
      freq,
    }
  }

  // ── Rent ────────────────────────────────────────────────────────────────────
  const rentGroups = groupRecurring(txs, PATTERNS.rent, 2)
  if (rentGroups.length > 0) {
    const g = rentGroups.sort((a, b) => avgAmount(b.amounts) - avgAmount(a.amounts))[0]
    const avg = avgAmount(g.amounts)
    if (avg > 400) {
      const confident = isConsistentAmount(g.amounts, 0.02) && g.amounts.length >= 2
      result.rent = {
        value:      String(Math.round(avg)),
        confidence: confident ? 'high' : 'medium',
        source:     `${g.description.slice(0, 28)} · ${g.amounts.length} charges`,
      }
    }
  } else {
    // Largest consistent monthly charge > $400 might be rent
    const largeFixed = txs
      .filter(tx => tx.amount > 400 && tx.amount < 8000)
      .reduce((map, tx) => {
        const key = String(Math.round(tx.amount / 10) * 10)
        map.set(key, (map.get(key) ?? 0) + 1)
        return map
      }, new Map<string, number>())
    const topFixed = [...largeFixed.entries()].sort((a, b) => b[1] - a[1])[0]
    if (topFixed && topFixed[1] >= 2) {
      result.nudges.push(`We noticed a recurring charge of ~$${topFixed[0]}/mo — is that your rent?`)
    }
  }

  // ── Utilities ───────────────────────────────────────────────────────────────
  const utilityDefs: { type: string; emoji: string; patterns: RegExp[]; confidence: Confidence }[] = [
    { type: 'Electric',       emoji: '⚡', patterns: PATTERNS.electric,  confidence: 'high' },
    { type: 'Water',          emoji: '💧', patterns: PATTERNS.water,     confidence: 'medium' },
    { type: 'Gas / Heat',     emoji: '🔥', patterns: PATTERNS.gas_heat,  confidence: 'medium' },
    { type: 'WiFi / Internet',emoji: '📶', patterns: PATTERNS.internet,  confidence: 'high' },
    { type: 'Phone',          emoji: '📱', patterns: PATTERNS.phone,     confidence: 'high' },
    { type: 'Trash',          emoji: '🗑️', patterns: PATTERNS.trash,    confidence: 'high' },
  ]

  for (const def of utilityDefs) {
    const groups = groupRecurring(txs, def.patterns, 2)
    if (groups.length > 0) {
      const g   = groups[0]
      const avg = avgAmount(g.amounts)
      const consistent = isConsistentAmount(g.amounts, 0.20)  // utilities have seasonal variance
      result.utilities.push({
        type:       def.type,
        amount:     String(Math.round(avg)),
        due_day:    mostCommonDueDay(g.dates),
        confidence: consistent ? def.confidence : 'medium',
        source:     `${g.description.slice(0, 28)} · ${g.amounts.length} charges avg $${Math.round(avg)}`,
      })
    }
  }

  // ── Insurance ───────────────────────────────────────────────────────────────
  const insGroups = groupRecurring(txs, PATTERNS.insurance, 2)
  const seenInsTypes = new Set<string>()
  for (const g of insGroups) {
    const avg  = avgAmount(g.amounts)
    const desc = g.description.toLowerCase()
    let type   = 'Insurance'
    if (/geico|progressive|state\s*farm|allstate|usaa|liberty|nationwide|farmers|travelers/.test(desc)) type = 'Auto'
    else if (/blue\s*cross|bcbs|aetna|cigna|humana|united|kaiser|anthem|health/.test(desc)) type = 'Health'
    else if (/life/.test(desc)) type = 'Life'
    else if (/home|renters/.test(desc)) type = 'Renters/Home'

    const key = type
    if (!seenInsTypes.has(key)) {
      seenInsTypes.add(key)
      result.insurances.push({
        type,
        amount:     String(Math.round(avg)),
        due_day:    mostCommonDueDay(g.dates),
        confidence: isConsistentAmount(g.amounts, 0.03) ? 'high' : 'medium',
        source:     `${g.description.slice(0, 28)} · ${g.amounts.length} charges`,
      })
    }
  }

  // ── Car payments ─────────────────────────────────────────────────────────────
  const carGroups = groupRecurring(txs, PATTERNS.car_payment, 2)
  for (const g of carGroups) {
    const avg = avgAmount(g.amounts)
    if (avg < 100 || avg > 2500) continue
    const desc   = g.description.toLowerCase()
    let type: 'loan' | 'lease' | 'rent' = 'loan'
    if (/lease/.test(desc)) type = 'lease'

    result.cars.push({
      type,
      amount:     String(Math.round(avg)),
      due_day:    mostCommonDueDay(g.dates),
      lender:     g.description.slice(0, 20).trim(),
      confidence: isConsistentAmount(g.amounts, 0.02) ? 'high' : 'medium',
      source:     `${g.description.slice(0, 28)} · ${g.amounts.length} charges`,
    })
  }

  // ── Groceries ────────────────────────────────────────────────────────────────
  const grocTxs   = txs.filter(tx => tx.amount > 0 && matches(tx.description, PATTERNS.groceries))
  if (grocTxs.length >= 4) {
    const monthlyAvg = (grocTxs.reduce((s, t) => s + t.amount, 0) / 6)  // 180 days = 6 months
    result.groceries = {
      value:      String(Math.round(monthlyAvg)),
      confidence: 'medium',
      source:     `${grocTxs.length} grocery charges over 180 days`,
    }
  }

  // ── Gas stations ─────────────────────────────────────────────────────────────
  const gasTxs = txs.filter(tx => tx.amount > 0 && matches(tx.description, PATTERNS.gas_station))
  if (gasTxs.length >= 3) {
    const monthlyAvg = (gasTxs.reduce((s, t) => s + t.amount, 0) / 6)
    result.gasStations = {
      value:      String(Math.round(monthlyAvg)),
      confidence: 'medium',
      source:     `${gasTxs.length} gas station charges over 180 days`,
    }
  }

  return result
}
