import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { userId, accountId } = await request.json()
    if (!userId || !accountId) {
      return NextResponse.json({ error: 'userId and accountId required' }, { status: 400 })
    }

    const account = await stripe.financialConnections.accounts.retrieve(accountId)

    const currentBalance = account.balance?.current
      ? Object.values(account.balance.current)[0] / 100
      : null
    const availableBalance = account.balance?.cash
      ? Object.values(account.balance.cash)[0] / 100
      : null

    const { error } = await supabase
      .from('stripe_fc_accounts')
      .upsert({
        user_id: userId,
        stripe_account_id: accountId,
        name: account.display_name ?? account.institution_name ?? 'Bank Account',
        institution_name: account.institution_name ?? null,
        current_balance: currentBalance,
        available_balance: availableBalance,
        subtype: account.subcategory ?? null,
        is_active: true,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'stripe_account_id' })

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('save-account error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
