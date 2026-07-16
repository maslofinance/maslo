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

    // Retrieve account and trigger an explicit balance refresh as fallback
    // (prefetch on session creation handles the common path; this covers edge cases)
    let account: any = null
    try {
      // Kick off a refresh in case prefetch didn't cover it
      await (stripe as any).financialConnections.accounts.refresh(accountId, {
        features: ['balance'],
      }).catch(() => {}) // non-fatal — refresh may already be in progress

      account = await stripe.financialConnections.accounts.retrieve(accountId, { expand: ['balance'] })
      console.log('FC account retrieved:', JSON.stringify({
        id: account.id,
        institution: account.institution_name,
        balance_refresh: account.balance_refresh,
        balance: account.balance,
      }))
    } catch (stripeErr: any) {
      console.error('Stripe FC retrieve error:', stripeErr.message)
    }

    const currentBalance = account?.balance?.current
      ? Object.values(account.balance.current as Record<string, number>)[0] / 100
      : null
    const availableBalance = account?.balance?.cash?.available
      ? Object.values(account.balance.cash.available as Record<string, number>)[0] / 100
      : null

    // Check if a row already exists for this user+account so we can update vs insert
    const { data: existing } = await supabase
      .from('stripe_fc_accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('stripe_account_id', accountId)
      .maybeSingle()

    const payload = {
      user_id: userId,
      stripe_account_id: accountId,
      name: account?.display_name ?? account?.institution_name ?? 'Bank Account',
      institution_name: account?.institution_name ?? null,
      current_balance: currentBalance,
      available_balance: availableBalance,
      subtype: account?.subcategory ?? null,
      is_active: true,
      last_synced_at: new Date().toISOString(),
    }

    const { error } = existing
      ? await supabase.from('stripe_fc_accounts').update(payload).eq('id', existing.id)
      : await supabase.from('stripe_fc_accounts').insert(payload)

    if (error) {
      console.error('Supabase upsert error:', error)
      throw error
    }

    return NextResponse.json({ success: true, institution: account?.institution_name ?? 'Bank Account', balance: currentBalance })
  } catch (err: any) {
    console.error('save-account error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
