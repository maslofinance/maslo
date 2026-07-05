// Subscription / recurring charge detector
// Runs on raw FC transactions and identifies recurring patterns.

import { categorizeByDescription, type VaultCategory } from './vault-categorization'

export interface RawTransaction {
  id: string
  date: string          // YYYY-MM-DD
  amount: number        // positive = expense (dollars)
  description: string
  isIncome: boolean
}

export interface DetectedSubscription {
  id: string
  merchantName: string
  normalizedName: string
  amount: number              // most recent charge amount
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual'
  frequencyLabel: string
  annualCost: number
  lastCharged: string         // YYYY-MM-DD
  occurrences: number
  vaultCategory: VaultCategory
  emoji: string
  keepFlag: boolean           // default true — user can toggle
}

// ── Merchant normalization ────────────────────────────────────────────────────
// Strip noise words so "NETFLIX.COM", "NETFLIX*1", "NETFLIX 800" all map to "Netflix"
const STRIP_PATTERNS = [
  /\*[\w\d]+/g,           // NETFLIX*12345
  /\s+\d{3,}/g,           // trailing phone/ref numbers
  /\.COM\b/gi,
  /\bINC\b|\bLLC\b|\bCORP\b/gi,
  /[^a-zA-Z0-9 ]/g,       // remaining punctuation
]

const KNOWN_NAMES: Record<string, string> = {
  netflix: 'Netflix',
  spotify: 'Spotify',
  hulu: 'Hulu',
  'disney plus': 'Disney+',
  disneyplus: 'Disney+',
  'apple com': 'Apple',
  'apple icloud': 'iCloud',
  amazon: 'Amazon',
  'amazon prime': 'Amazon Prime',
  'youtube premium': 'YouTube Premium',
  youtube: 'YouTube Premium',
  'google one': 'Google One',
  google: 'Google',
  'microsoft 365': 'Microsoft 365',
  microsoft: 'Microsoft',
  dropbox: 'Dropbox',
  slack: 'Slack',
  notion: 'Notion',
  figma: 'Figma',
  github: 'GitHub',
  openai: 'ChatGPT',
  chatgpt: 'ChatGPT',
  peloton: 'Peloton',
  calm: 'Calm',
  headspace: 'Headspace',
  duolingo: 'Duolingo',
  chegg: 'Chegg',
  'adobe': 'Adobe',
  'hbo': 'Max (HBO)',
  'max': 'Max (HBO)',
  'paramount': 'Paramount+',
  'peacock': 'Peacock',
  'espn': 'ESPN+',
  'audible': 'Audible',
  'kindle': 'Kindle Unlimited',
  'xm': 'SiriusXM',
  'siriusxm': 'SiriusXM',
  'pandora': 'Pandora',
  'tidal': 'Tidal',
  'playstation': 'PlayStation',
  'xbox': 'Xbox Game Pass',
  'nintendo': 'Nintendo',
  'ifit': 'iFIT',
  'noom': 'Noom',
  'weight watchers': 'WeightWatchers',
  'doordash': 'DoorDash DashPass',
  'instacart': 'Instacart+',
  'grubhub': 'Grubhub+',
}

function normalizeMerchant(raw: string): { key: string; displayName: string } {
  let s = raw.toUpperCase()
  for (const pat of STRIP_PATTERNS) s = s.replace(pat, ' ')
  s = s.trim().toLowerCase().replace(/\s+/g, ' ')

  // Check known names first
  for (const [key, display] of Object.entries(KNOWN_NAMES)) {
    if (s.includes(key)) return { key, displayName: display }
  }

  // Title-case fallback
  const display = s.replace(/\b\w/g, c => c.toUpperCase()).trim()
  return { key: s, displayName: display }
}

// ── Frequency detection ───────────────────────────────────────────────────────
function detectFrequency(dates: string[]): DetectedSubscription['frequency'] | null {
  if (dates.length < 2) return null

  const sorted = [...dates].sort()
  const ms = sorted.map(d => new Date(d).getTime())
  const gaps: number[] = []
  for (let i = 1; i < ms.length; i++) gaps.push((ms[i] - ms[i - 1]) / (1000 * 60 * 60 * 24))

  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length
  const variance = gaps.reduce((a, b) => a + Math.abs(b - avgGap), 0) / gaps.length

  // Reject if variance is too high (not truly recurring)
  if (variance > avgGap * 0.4) return null

  if (avgGap <= 8)   return 'weekly'
  if (avgGap <= 16)  return 'biweekly'
  if (avgGap <= 35)  return 'monthly'
  if (avgGap <= 100) return 'quarterly'
  if (avgGap <= 400) return 'annual'

  return null
}

const FREQ_LABELS: Record<DetectedSubscription['frequency'], string> = {
  weekly:    'Weekly',
  biweekly:  'Every 2 weeks',
  monthly:   'Monthly',
  quarterly: 'Quarterly',
  annual:    'Annual',
}

const FREQ_MULTIPLIER: Record<DetectedSubscription['frequency'], number> = {
  weekly:    52,
  biweekly:  26,
  monthly:   12,
  quarterly: 4,
  annual:    1,
}

// ── Emoji assignment ──────────────────────────────────────────────────────────
function assignEmoji(name: string, category: VaultCategory): string {
  const n = name.toLowerCase()
  if (/netflix|hulu|disney|hbo|max|paramount|peacock|espn|youtube/.test(n)) return '📺'
  if (/spotify|apple music|tidal|pandora|sirius|audible/.test(n)) return '🎵'
  if (/amazon|prime/.test(n)) return '📦'
  if (/icloud|google one|dropbox|microsoft/.test(n)) return '☁️'
  if (/gym|peloton|fitness|ifit|noom/.test(n)) return '💪'
  if (/calm|headspace|meditation/.test(n)) return '🧘'
  if (/game|playstation|xbox|nintendo/.test(n)) return '🎮'
  if (/adobe|figma|notion|slack|github|openai|chatgpt/.test(n)) return '💻'
  if (/insurance/.test(n)) return '🛡️'
  if (/duolingo|chegg|kindle/.test(n)) return '📚'
  if (/doordash|grubhub|instacart/.test(n)) return '🛒'
  if (category === 'essentials') return '🏡'
  if (category === 'debt') return '💳'
  if (category === 'future') return '🚀'
  return '🔄'
}

// ── Main detector ─────────────────────────────────────────────────────────────
export function detectSubscriptions(transactions: RawTransaction[]): DetectedSubscription[] {
  // Only look at expenses, not income
  const expenses = transactions.filter(tx => !tx.isIncome && tx.amount > 0 && tx.amount < 500)

  // Group by normalized merchant key
  const groups = new Map<string, { displayName: string; entries: { date: string; amount: number }[] }>()

  for (const tx of expenses) {
    const { key, displayName } = normalizeMerchant(tx.description)
    if (!groups.has(key)) groups.set(key, { displayName, entries: [] })
    groups.get(key)!.entries.push({ date: tx.date, amount: tx.amount })
  }

  const subscriptions: DetectedSubscription[] = []

  for (const [key, { displayName, entries }] of groups) {
    if (entries.length < 2) continue  // need at least 2 hits to call it recurring

    const dates = entries.map(e => e.date)
    const frequency = detectFrequency(dates)
    if (!frequency) continue

    // Check amount consistency (allow ±15% variance — handles taxes, price bumps)
    const amounts = entries.map(e => e.amount)
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length
    const amountVariance = amounts.reduce((a, b) => a + Math.abs(b - avgAmount), 0) / amounts.length
    if (amountVariance / avgAmount > 0.15) continue

    const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date))
    const latestAmount = sorted[0].amount
    const lastCharged = sorted[0].date
    const annualCost = Math.round(latestAmount * FREQ_MULTIPLIER[frequency] * 100) / 100

    const vaultCategory = categorizeByDescription(displayName)

    subscriptions.push({
      id: key,
      merchantName: displayName,
      normalizedName: key,
      amount: latestAmount,
      frequency,
      frequencyLabel: FREQ_LABELS[frequency],
      annualCost,
      lastCharged,
      occurrences: entries.length,
      vaultCategory,
      emoji: assignEmoji(displayName, vaultCategory),
      keepFlag: true,
    })
  }

  // Sort: highest annual cost first
  return subscriptions.sort((a, b) => b.annualCost - a.annualCost)
}
