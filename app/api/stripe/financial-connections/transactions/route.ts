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

    // Pull all transactions from the last 180 days, paginating through all pages
    const cutoff = Math.floor(Date.now() / 1000) - 180 * 24 * 60 * 60
    const allTxs: any[] = []
    let hasMore = true
    let startingAfter: string | undefined = undefined

    while (hasMore) {
      const page: any = await stripe.financialConnections.transactions.list({
        account: accountId,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
        transacted_at: { gte: cutoff },
      })
      allTxs.push(...page.data)
      hasMore = page.has_more
      if (page.has_more && page.data.length > 0) {
        startingAfter = page.data[page.data.length - 1].id
      } else {
        hasMore = false
      }
    }

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
      transactions: allTxs.map((t) => ({
        id: t.id,
        date: t.transacted_at,
        amount: t.amount,
        currency: t.currency,
        description: t.description,
        status: t.status,
      })),
      total: allTxs.length,
    })
  } catch (err: any) {
    console.error('Financial Connections transactions error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
