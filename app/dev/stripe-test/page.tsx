'use client'

import { useState } from 'react'

// Hardcoded test user ID for sandbox testing — replace with real auth session in production
const TEST_USER_ID = 'test-user-sandbox-001'

export default function StripeTestPage() {
  const [status, setStatus] = useState<string>('')
  const [sessionData, setSessionData] = useState<any>(null)
  const [accountId, setAccountId] = useState<string>('')
  const [transactionData, setTransactionData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  async function createSession() {
    setLoading(true)
    setStatus('Creating Financial Connections session...')
    try {
      const res = await fetch('/api/stripe/financial-connections/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: TEST_USER_ID }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSessionData(data)
      setStatus(`Session created. client_secret starts with: ${data.client_secret?.slice(0, 30)}...`)
    } catch (err: any) {
      setStatus(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function fetchTransactions() {
    if (!accountId.trim()) {
      setStatus('Enter an account ID first')
      return
    }
    setLoading(true)
    setStatus('Fetching transactions...')
    try {
      const res = await fetch(`/api/stripe/financial-connections/transactions?account_id=${accountId.trim()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTransactionData(data)
      setStatus(`Fetched ${data.transactions?.length} transactions from ${data.account?.institution_name}`)
    } catch (err: any) {
      setStatus(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8 font-mono">
      <h1 className="text-2xl font-bold mb-2">Stripe Financial Connections — Sandbox Test</h1>
      <p className="text-gray-400 text-sm mb-8">Dev only. Tests the full FC session + transaction pull flow.</p>

      {/* Step 1: Create Session */}
      <section className="mb-8 p-6 bg-gray-900 rounded-xl border border-gray-800">
        <h2 className="text-lg font-semibold mb-1">Step 1 — Create FC Session</h2>
        <p className="text-gray-400 text-sm mb-4">
          Creates a session with permissions: balances, ownership, transactions.
          The client_secret is what you'd pass to Stripe.js to open the bank-linking modal.
        </p>
        <button
          onClick={createSession}
          disabled={loading}
          className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium"
        >
          {loading ? 'Loading...' : 'Create Session'}
        </button>

        {sessionData && (
          <div className="mt-4 p-4 bg-gray-800 rounded-lg text-xs overflow-auto">
            <pre>{JSON.stringify(sessionData, null, 2)}</pre>
          </div>
        )}
      </section>

      {/* Step 2: Fetch Transactions */}
      <section className="mb-8 p-6 bg-gray-900 rounded-xl border border-gray-800">
        <h2 className="text-lg font-semibold mb-1">Step 2 — Fetch Transactions</h2>
        <p className="text-gray-400 text-sm mb-4">
          After linking an account via the FC modal, enter the account ID (fca_...) to pull transaction data.
          In sandbox, use a test account ID from Stripe docs or the session response.
        </p>
        <div className="flex gap-3 mb-4">
          <input
            type="text"
            placeholder="fca_..."
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-500"
          />
          <button
            onClick={fetchTransactions}
            disabled={loading}
            className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium"
          >
            {loading ? 'Loading...' : 'Fetch Transactions'}
          </button>
        </div>

        {transactionData && (
          <div className="space-y-4">
            <div className="p-4 bg-gray-800 rounded-lg text-xs">
              <h3 className="font-semibold text-purple-400 mb-2">Account</h3>
              <pre>{JSON.stringify(transactionData.account, null, 2)}</pre>
            </div>
            <div className="p-4 bg-gray-800 rounded-lg text-xs overflow-auto max-h-96">
              <h3 className="font-semibold text-purple-400 mb-2">
                Transactions ({transactionData.transactions?.length})
                {transactionData.has_more && ' — more available'}
              </h3>
              <pre>{JSON.stringify(transactionData.transactions, null, 2)}</pre>
            </div>
          </div>
        )}
      </section>

      {/* Status bar */}
      {status && (
        <div className="p-4 bg-gray-900 rounded-xl border border-gray-700 text-sm text-gray-300">
          <span className="text-purple-400">Status: </span>{status}
        </div>
      )}
    </div>
  )
}
