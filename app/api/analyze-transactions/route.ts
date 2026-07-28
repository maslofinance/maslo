import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { analyzeBankData, RawFCTransaction } from '@/lib/bank-prefill'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const token = auth.slice(7)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: accounts } = await supabase
      .from('stripe_fc_accounts')
      .select('stripe_account_id')
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (!accounts?.length) return NextResponse.json({ error: 'No linked accounts' }, { status: 400 })

    const cutoff = Math.floor(Date.now() / 1000) - 180 * 24 * 60 * 60
    const allTxs: RawFCTransaction[] = []

    for (const acct of accounts) {
      // Non-fatal refresh
      await (stripe as any).financialConnections.accounts.refresh(acct.stripe_account_id, {
        features: ['transactions'],
      }).catch(() => {})

      let hasMore = true
      let startingAfter: string | undefined
      while (hasMore) {
        const page: any = await stripe.financialConnections.transactions.list({
          account: acct.stripe_account_id,
          limit: 100,
          ...(startingAfter ? { starting_after: startingAfter } : {}),
          transacted_at: { gte: cutoff },
        })
        for (const t of page.data) {
          allTxs.push({
            id: t.id,
            date: t.transacted_at,
            amount: t.amount / 100,
            description: t.description ?? '',
            category: t.category ?? undefined,
            subcategory: t.subcategory ?? undefined,
          })
        }
        hasMore = page.has_more
        if (page.has_more && page.data.length > 0) startingAfter = page.data[page.data.length - 1].id
        else hasMore = false
      }
    }

    const analysis = analyzeBankData(allTxs)
    return NextResponse.json({ analysis, tx_count: allTxs.length })
  } catch (err: any) {
    console.error('analyze-transactions error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
