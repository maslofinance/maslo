import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'

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

    // Load all active FC accounts for this user
    const { data: accounts } = await supabase
      .from('stripe_fc_accounts')
      .select('id, stripe_account_id, subtype')
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (!accounts?.length) return NextResponse.json({ synced: 0 })

    const results = await Promise.all(accounts.map(async (row) => {
      try {
        // Kick off balance refresh
        await (stripe as any).financialConnections.accounts.refresh(row.stripe_account_id, {
          features: ['balance'],
        }).catch(() => {})

        // Poll Stripe until balance_refresh.status === 'succeeded' (max 20s)
        let account: any = null
        const deadline = Date.now() + 20000
        while (Date.now() < deadline) {
          account = await stripe.financialConnections.accounts.retrieve(
            row.stripe_account_id,
            { expand: ['balance'] }
          )
          const refreshStatus = (account as any).balance_refresh?.status
          console.log(`[Sync] ${row.stripe_account_id} balance_refresh.status: ${refreshStatus}`)
          if (refreshStatus === 'succeeded' || refreshStatus === 'failed' || !refreshStatus) break
          await new Promise(r => setTimeout(r, 2000))
        }

        if (!account || account.status === 'inactive') {
          return { id: row.id, status: 'inactive' }
        }

        const bal = account?.balance as any
        console.log(`[Sync] ${row.stripe_account_id} raw balance:`, JSON.stringify(bal))

        const currentBalance = bal?.current
          ? Object.values(bal.current as Record<string, number>)[0] / 100
          : null
        const availableBalance = bal?.cash?.available
          ? Object.values(bal.cash.available as Record<string, number>)[0] / 100
          : bal?.current
            ? Object.values(bal.current as Record<string, number>)[0] / 100
            : null

        console.log(`[Sync] ${row.stripe_account_id} → current: ${currentBalance}, available: ${availableBalance}`)

        await supabase
          .from('stripe_fc_accounts')
          .update({
            current_balance: currentBalance,
            available_balance: availableBalance,
            last_synced_at: new Date().toISOString(),
          })
          .eq('id', row.id)

        return { id: row.id, status: 'synced', balance: currentBalance }
      } catch (err: any) {
        console.error(`[Sync] Failed for ${row.stripe_account_id}:`, err.message)
        return { id: row.id, status: 'error', error: err.message }
      }
    }))

    return NextResponse.json({ synced: results.filter(r => r.status === 'synced').length, results })
  } catch (err: any) {
    console.error('sync error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
