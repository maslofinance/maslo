// Shared vault categorization logic — used by both the webhook and the FC transaction display.
// Maps Stripe MCC codes and transaction descriptions to Maslo vault categories.

export type VaultCategory = 'essentials' | 'debt' | 'future' | 'lifestyle'

export interface CategorizedTransaction {
  id: string
  date: string
  amount: number           // in dollars, positive = expense, negative = income
  description: string
  merchantName: string
  vaultCategory: VaultCategory
  vaultLabel: string
  vaultColor: string
  vaultEmoji: string
  isIncome: boolean
  status: 'approved' | 'denied' | 'pending' | 'uncategorized'
  mcc?: string
}

export const VAULT_META: Record<VaultCategory, { label: string; color: string; emoji: string; bg: string }> = {
  essentials: { label: 'Essentials', color: '#10b981', emoji: '🏡', bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  debt:       { label: 'Debt',       color: '#f59e0b', emoji: '💳', bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  future:     { label: 'Future',     color: '#6366f1', emoji: '🚀', bg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
  lifestyle:  { label: 'Lifestyle',  color: '#ec4899', emoji: '🎉', bg: 'bg-pink-500/10 text-pink-400 border-pink-500/20' },
}

// MCC → vault category mapping
const ESSENTIALS_MCC = new Set([
  '5411', '5412',          // Grocery stores
  '5912',                  // Drug stores / pharmacies
  '4900',                  // Utilities
  '4814',                  // Phone / telecom
  '6300', '6311', '6321',  // Insurance
  '5251',                  // Hardware stores
  '8099', '8011', '8021', '8041', '8049', '8050', '8062', '8099', // Medical
  '5541', '5542',          // Gas stations
  '4111', '4112', '4121', '4131', // Transit / rideshare
  '5311',                  // Department stores (essentials overlap)
  '5331',                  // Variety stores
  '7299',                  // Laundry / personal services
])

const DEBT_MCC = new Set([
  '6012', '6011', '6051',  // Financial institutions / loan payments
  '6141',                  // Personal credit institutions
])

const FUTURE_MCC = new Set([
  '6211',                  // Security brokers / investment
  '6020', '6022',          // Savings institutions
])

export function mapMccToVaultCategory(mcc?: string): VaultCategory {
  if (!mcc) return 'lifestyle'
  if (ESSENTIALS_MCC.has(mcc)) return 'essentials'
  if (DEBT_MCC.has(mcc)) return 'debt'
  if (FUTURE_MCC.has(mcc)) return 'future'
  return 'lifestyle'
}

// Heuristic description-based categorization for when MCC isn't available
export function categorizeByDescription(description: string): VaultCategory {
  const d = description.toLowerCase()

  if (/rent|mortgage|electric|gas bill|water|internet|insurance|verizon|at&t|tmobile|comcast|xfinity|spectrum|geico|progressive|allstate/i.test(d))
    return 'essentials'
  if (/grocery|groceries|whole foods|trader joe|safeway|kroger|publix|aldi|wegmans|costco|walmart|target/i.test(d))
    return 'essentials'
  if (/walgreens|cvs|rite aid|pharmacy|urgent care|hospital|doctor|dental|vision/i.test(d))
    return 'essentials'
  if (/uber|lyft|metro|transit|mta|caltrain|bart|gas station|shell|chevron|bp |exxon|sunoco/i.test(d))
    return 'essentials'
  if (/loan|credit card payment|discover|capital one payment|chase payment|citi payment|amex payment|student loan|sallie mae|navient/i.test(d))
    return 'debt'
  if (/fidelity|vanguard|schwab|robinhood|coinbase|acorns|betterment|ira|401k|savings transfer/i.test(d))
    return 'future'

  return 'lifestyle'
}

export function categorizeTransaction(tx: {
  description: string
  mcc?: string
  amount: number
}): { vaultCategory: VaultCategory; isIncome: boolean } {
  const isIncome = tx.amount < 0  // negative = money in (Stripe FC convention)

  if (isIncome) {
    return { vaultCategory: 'future', isIncome: true }
  }

  const fromMcc = tx.mcc ? mapMccToVaultCategory(tx.mcc) : null
  const vaultCategory = fromMcc !== 'lifestyle'
    ? fromMcc!
    : categorizeByDescription(tx.description)

  return { vaultCategory, isIncome: false }
}
