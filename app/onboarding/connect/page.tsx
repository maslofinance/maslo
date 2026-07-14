'use client'

import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { categorizeTransaction, VAULT_META, type VaultCategory, type CategorizedTransaction } from '@/lib/vault-categorization'

// Defer loadStripe so it only runs client-side, never during SSR
let stripePromise: ReturnType<typeof loadStripe> | null = null
function getStripe() {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)
  }
  return stripePromise
}

// In production this comes from the auth session
const USER_ID = 'e86855ba-a080-46e7-809a-f2046520d05a'

type LinkedAccount = {
  id: string
  display_name: string
  institution_name: string
  category: string
  subcategory: string
  status: string
  balance: any
}

type SpendSummary = Record<VaultCategory, number>

export default function ConnectBankPage() {
  const [step, setStep] = useState<'idle' | 'linking' | 'loading' | 'done' | 'error'>('idle')
  const [linkedAccount, setLinkedAccount] = useState<LinkedAccount | null>(null)
  const [transactions, setTransactions] = useState<CategorizedTransaction[]>([])
  const [summary, setSummary] = useState<SpendSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<VaultCategory | 'all'>('all')

  async function linkBank() {
    setStep('linking')
    setError(null)

    try {
      // 1. Create a Financial Connections session
      const res = await fetch('/api/stripe/financial-connections/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: USER_ID }),
      })
      const { client_secret, error: sessionError } = await res.json()
      if (sessionError) throw new Error(sessionError)

      // 2. Open the Stripe FC modal
      const stripe = await getStripe()
      if (!stripe) throw new Error('Stripe failed to load')

      const result = await (stripe as any).collectFinancialConnectionsAccounts({ clientSecret: client_secret })

      if (result.error) throw new Error(result.error.message)
      if (!result.financialConnectionsSession?.accounts?.length) {
        throw new Error('No accounts linked. Please try again.')
      }

      const account = result.financialConnectionsSession.accounts[0]
      const accountId = account.id

      // 3. Pull 180-day transaction history
      setStep('loading')
      const txRes = await fetch(`/api/stripe/financial-connections/transactions?account_id=${accountId}`)
      const txData = await txRes.json()
      if (txData.error) throw new Error(txData.error)

      // 4. Run every transaction through vault categorization
      const categorized: CategorizedTransaction[] = txData.transactions.map((tx: any) => {
        const { vaultCategory, isIncome } = categorizeTransaction({
          description: tx.description ?? '',
          amount: tx.amount,
        })
        const meta = VAULT_META[vaultCategory]
        return {
          id: tx.id,
          date: tx.date,
          amount: Math.abs(tx.amount / 100),
          description: tx.description ?? 'Unknown',
          merchantName: tx.description ?? 'Unknown',
          vaultCategory,
          vaultLabel: meta.label,
          vaultColor: meta.color,
          vaultEmoji: meta.emoji,
          isIncome,
          status: 'uncategorized' as const,
          mcc: tx.category,
        }
      })

      // 5. Build spend summary by vault category
      const spend: SpendSummary = { essentials: 0, debt: 0, future: 0, lifestyle: 0 }
      categorized.forEach(tx => {
        if (!tx.isIncome) spend[tx.vaultCategory] += tx.amount
      })

      setLinkedAccount({
        id: accountId,
        display_name: account.display_name ?? 'Linked Account',
        institution_name: account.institution_name ?? 'Bank',
        category: account.category ?? '',
        subcategory: account.subcategory ?? '',
        status: account.status ?? '',
        balance: account.balance,
      })
      setTransactions(categorized)
      setSummary(spend)
      setStep('done')

    } catch (err: any) {
      console.error(err)
      setError(err.message)
      setStep('error')
    }
  }

  const filtered = filter === 'all' ? transactions : transactions.filter(tx => tx.vaultCategory === filter)
  const totalSpend = summary ? Object.values(summary).reduce((a, b) => a + b, 0) : 0

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-4 py-12">

        {/* Header */}
        <div className="mb-10">
          <div className="text-purple-400 text-sm font-medium tracking-widest uppercase mb-2">Maslo</div>
          <h1 className="text-3xl font-bold mb-2">Connect Your Bank</h1>
          <p className="text-gray-400">
            Maslo reads 180 days of transactions to understand your spending — then assigns every dollar to the right vault automatically.
          </p>
        </div>

        {/* Idle / error state */}
        {(step === 'idle' || step === 'error') && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
            <div className="text-5xl mb-4">🏦</div>
            <h2 className="text-xl font-semibold mb-2">Link your checking account</h2>
            <p className="text-gray-400 text-sm mb-6">
              Secure read-only access via Stripe Financial Connections. Maslo never stores your credentials.
            </p>
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}
            <button
              onClick={linkBank}
              className="bg-purple-600 hover:bg-purple-700 active:scale-95 transition-all px-8 py-3 rounded-xl font-semibold text-base"
            >
              Link Bank Account
            </button>
            <p className="text-gray-600 text-xs mt-4">
              Powered by Stripe Financial Connections · 5,000+ supported institutions
            </p>
          </div>
        )}

        {/* Linking / loading */}
        {(step === 'linking' || step === 'loading') && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
            <div className="text-4xl mb-4 animate-spin inline-block">⚙️</div>
            <p className="text-gray-300 font-medium mt-2">
              {step === 'linking' ? 'Opening secure bank connection…' : 'Pulling 180 days of transactions…'}
            </p>
          </div>
        )}

        {/* Results */}
        {step === 'done' && linkedAccount && summary && (
          <div className="space-y-6">

            {/* Linked account card */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center text-2xl shrink-0">
                🏦
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{linkedAccount.institution_name}</div>
                <div className="text-gray-400 text-sm capitalize">
                  {linkedAccount.display_name} · {linkedAccount.subcategory}
                </div>
              </div>
              {linkedAccount.balance?.current != null && (
                <div className="text-right shrink-0">
                  <div className="font-semibold text-emerald-400">
                    ${(linkedAccount.balance.current / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-gray-500 text-xs">Current balance</div>
                </div>
              )}
            </div>

            {/* Spend summary by vault — tap to filter */}
            <div>
              <h2 className="text-lg font-semibold mb-3">180-Day Spend by Vault</h2>
              <div className="grid grid-cols-2 gap-3">
                {(Object.entries(summary) as [VaultCategory, number][]).map(([cat, amount]) => {
                  const meta = VAULT_META[cat]
                  const pct = totalSpend > 0 ? (amount / totalSpend) * 100 : 0
                  return (
                    <button
                      key={cat}
                      onClick={() => setFilter(filter === cat ? 'all' : cat)}
                      className={`text-left p-4 rounded-xl border transition-all ${meta.bg} ${filter === cat ? 'ring-2 ring-purple-500' : 'hover:brightness-110'}`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span>{meta.emoji}</span>
                        <span className="font-medium text-sm">{meta.label}</span>
                      </div>
                      <div className="text-xl font-bold">
                        ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs opacity-60 mt-0.5">{pct.toFixed(0)}% of total spend</div>
                      <div className="mt-2 h-1 rounded-full bg-black/20">
                        <div className="h-1 rounded-full bg-current opacity-60" style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Transaction feed */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">
                  Transactions
                  <span className="text-gray-500 text-sm font-normal ml-2">
                    ({filtered.length}{filter !== 'all' ? ` ${VAULT_META[filter].label}` : ''} of {transactions.length})
                  </span>
                </h2>
                {filter !== 'all' && (
                  <button
                    onClick={() => setFilter('all')}
                    className="text-purple-400 text-sm hover:text-purple-300"
                  >
                    Show all
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {filtered.length === 0 && (
                  <div className="text-center text-gray-500 py-10">No transactions in this category</div>
                )}
                {filtered.map(tx => {
                  const meta = VAULT_META[tx.vaultCategory]
                  return (
                    <div
                      key={tx.id}
                      className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center gap-3"
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-base border shrink-0 ${meta.bg}`}>
                        {tx.isIncome ? '💰' : meta.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{tx.description}</div>
                        <div className="text-gray-500 text-xs">{tx.date}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`font-semibold text-sm ${tx.isIncome ? 'text-emerald-400' : 'text-white'}`}>
                          {tx.isIncome ? '+' : '-'}${tx.amount.toFixed(2)}
                        </div>
                        <span className={`text-xs border px-1.5 py-0.5 rounded-md ${meta.bg}`}>
                          {tx.isIncome ? 'Income' : meta.label}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Re-link */}
            <div className="text-center pt-2 pb-8">
              <button
                onClick={() => { setStep('idle'); setLinkedAccount(null); setTransactions([]); setSummary(null); setFilter('all') }}
                className="text-gray-500 text-sm hover:text-gray-400"
              >
                Link a different account
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
