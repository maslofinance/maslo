import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('account_id')

    if (!accountId) {
      return NextResponse.json({ error: 'account_id required' }, { status: 400 })
    }

    // Refresh transactions first to get the latest data
    await stripe.financialConnections.accounts.refresh(accountId, {
      features: ['transactions'],
    })

    // Pull up to 180 days of transactions
    const transactions = await stripe.financialConnections.transactions.list({
      account: accountId,
      limit: 100,
    })

    // Also grab account details (balance, ownership)
    const account = await stripe.financialConnections.accounts.retrieve(accountId)

    return NextResponse.json({
      account: {
        id: account.id,
        display_name: account.display_name,
        institution_name: account.institution_name,
        category: account.category,
        subcategory: account.subcategory,
        status: account.status,
        balance: account.balance,
      },
      transactions: transactions.data.map((t) => ({
        id: t.id,
        date: t.transacted_at,
        amount: t.amount, // in cents, negative = debit
        currency: t.currency,
        description: t.description,
        status: t.status,
        category: t.livemode ? null : '(sandbox test data)',
      })),
      has_more: transactions.has_more,
    })
  } catch (err: any) {
    console.error('Financial Connections transactions error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
