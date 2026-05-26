import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getRequestUser } from '@/lib/supabase-server'
import { plaidClient } from '@/lib/plaid'

const ANALYSIS_DAYS = 90

export interface DetectedRecurring {
  name: string
  display_name: string
  amount: number
  category: 'rent' | 'car_payment' | 'insurance' | 'utility' | 'subscription' | 'income' | 'other'
  frequency: 'monthly' | 'weekly' | 'biweekly' | 'annual'
  confidence: number
  transaction_ids: string[]
}

export interface AnalysisResult {
  detected_income: DetectedRecurring[]
  detected_bills: DetectedRecurring[]
  detected_subscriptions: DetectedRecurring[]
  raw_transaction_count: number
  date_range: { start: string; end: string }
}

interface RawTx {
  transaction_id: string
  name: string
  merchant_name: string
  amount: number   // positive = debit (expense), negative = credit (income) in Plaid
  date: string
  plaid_category: string
  pending: boolean
}

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase = createServerClient()

    const { data: items } = await supabase
      .from('plaid_items')
      .select('plaid_access_token')
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (!items?.length) return NextResponse.json({ error: 'No linked accounts' }, { status: 400 })

    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - ANALYSIS_DAYS)

    const allTx: RawTx[] = []

    for (const item of items) {
      try {
        let cursor: string | undefined
        let hasMore = true
        while (hasMore) {
          const res = await plaidClient.transactionsSync({
            access_token: item.plaid_access_token,
            cursor,
            count: 500,
          })
          for (const t of res.data.added) {
            allTx.push({
              transaction_id: t.transaction_id,
              name: t.name,
              merchant_name: t.merchant_name ?? t.name,
              amount: t.amount,
              date: t.date,
              plaid_category: t.personal_finance_category?.primary ?? t.category?.[0] ?? 'OTHER',
              pending: t.pending,
            })
          }
          cursor = res.data.next_cursor
          hasMore = res.data.has_more
        }
      } catch (e) {
        console.error('Plaid sync error:', e)
      }
    }

    return NextResponse.json(analyze(allTx, startDate, endDate))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Analysis failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function normKey(s: string) {
  return s.replace(/[#*]\d+/g, '').replace(/\b(LLC|INC|CO|CORP)\b/gi, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function displayName(s: string) {
  return s.replace(/[#*]\d+/g, '').replace(/\b(LLC|INC|CO|CORP)\b/gi, '').replace(/\s+/g, ' ').trim()
}

function avg(nums: number[]) { return nums.reduce((a, b) => a + b, 0) / nums.length }

function confidence(amounts: number[], count: number) {
  if (count < 2) return 0
  const mean = avg(amounts)
  if (mean === 0) return 0
  const cv = Math.sqrt(avg(amounts.map(a => (a - mean) ** 2))) / mean
  return Math.max(0, 1 - cv) * 0.7 + Math.min(1, count / 4) * 0.3
}

function frequency(txns: RawTx[]): DetectedRecurring['frequency'] {
  if (txns.length < 2) return 'monthly'
  const dates = txns.map(t => new Date(t.date).getTime()).sort((a, b) => a - b)
  const gaps = dates.slice(1).map((d, i) => (d - dates[i]) / 86_400_000)
  const g = avg(gaps)
  if (g < 10) return 'weekly'
  if (g < 20) return 'biweekly'
  if (g < 45) return 'monthly'
  return 'annual'
}

function classifyBill(name: string, amount: number, plaidCat: string): DetectedRecurring['category'] {
  const m = name.toLowerCase()
  if (/rent|realty|apartment|hoa|mortgage|property/.test(m) || (amount > 700 && /pmnt|pmt|payment/.test(m))) return 'rent'
  if (/honda|toyota|ford|chevy|bmw|mercedes|nissan|hyundai|kia|ally|capital one auto|auto loan|vehicle/.test(m)) return 'car_payment'
  if (/insurance|geico|progressive|state farm|allstate|usaa|aetna|cigna|blue cross|anthem|humana|metlife/.test(m)) return 'insurance'
  if (/electric|gas|water|internet|comcast|xfinity|at&t|verizon|t.mobile|sprint|utility|pg&e|con ed|duke|spectrum/.test(m)) return 'utility'
  if (amount < 50 && /netflix|spotify|hulu|disney|apple|amazon prime|youtube|adobe|microsoft|dropbox|gym|fitness/.test(m)) return 'subscription'
  if (plaidCat === 'LOAN_PAYMENTS') return 'car_payment'
  if (plaidCat === 'RENT_AND_UTILITIES') return 'utility'
  return 'other'
}

function analyze(txns: RawTx[], start: Date, end: Date): AnalysisResult {
  const inRange = txns.filter(t => {
    const d = new Date(t.date)
    return d >= start && d <= end && !t.pending
  })

  const expenses = inRange.filter(t => t.amount > 0)
  const credits  = inRange.filter(t => t.amount < 0)

  const groupBy = (arr: RawTx[]) => {
    const g: Record<string, RawTx[]> = {}
    for (const t of arr) {
      const k = normKey(t.merchant_name || t.name)
      ;(g[k] ??= []).push(t)
    }
    return g
  }

  const detected_income: DetectedRecurring[] = []
  for (const [, txs] of Object.entries(groupBy(credits))) {
    if (txs.length < 2) continue
    const amounts = txs.map(t => Math.abs(t.amount))
    const conf = confidence(amounts, txs.length)
    if (conf < 0.4) continue
    detected_income.push({
      name: normKey(txs[0].merchant_name || txs[0].name),
      display_name: displayName(txs[0].merchant_name || txs[0].name),
      amount: avg(amounts),
      category: 'income',
      frequency: frequency(txs),
      confidence: conf,
      transaction_ids: txs.map(t => t.transaction_id),
    })
  }

  const detected_bills: DetectedRecurring[] = []
  const detected_subscriptions: DetectedRecurring[] = []

  for (const [, txs] of Object.entries(groupBy(expenses))) {
    if (txs.length < 2) continue
    const amounts = txs.map(t => t.amount)
    const conf = confidence(amounts, txs.length)
    if (conf < 0.4) continue
    const cat = classifyBill(txs[0].merchant_name || txs[0].name, avg(amounts), txs[0].plaid_category)
    const rec: DetectedRecurring = {
      name: normKey(txs[0].merchant_name || txs[0].name),
      display_name: displayName(txs[0].merchant_name || txs[0].name),
      amount: avg(amounts),
      category: cat,
      frequency: frequency(txs),
      confidence: conf,
      transaction_ids: txs.map(t => t.transaction_id),
    }
    if (cat === 'subscription') detected_subscriptions.push(rec)
    else if (cat !== 'other' || avg(amounts) > 100) detected_bills.push(rec)
  }

  detected_bills.sort((a, b) => b.amount - a.amount)
  detected_income.sort((a, b) => b.amount - a.amount)

  return {
    detected_income,
    detected_bills,
    detected_subscriptions,
    raw_transaction_count: inRange.length,
    date_range: { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] },
  }
}
