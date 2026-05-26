import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getRequestUser } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase = createServerClient()

    const uid = user.id

    // Delete in dependency order
    const { data: vaults } = await supabase.from('vaults').select('id').eq('user_id', uid)
    if (vaults?.length) {
      const ids = vaults.map(v => v.id)
      await supabase.from('vault_ledger').delete().in('vault_id', ids)
      await supabase.from('allocation_rules').delete().in('vault_id', ids)
      await supabase.from('transactions').delete().in('vault_id', ids)
      await supabase.from('vaults').delete().in('id', ids)
    }

    await supabase.from('transactions').delete().eq('user_id', uid)
    await supabase.from('income_events').delete().eq('user_id', uid)
    await supabase.from('goals').delete().eq('user_id', uid)
    await supabase.from('user_merchant_rules').delete().eq('user_id', uid)

    const { data: items } = await supabase.from('plaid_items').select('id').eq('user_id', uid)
    if (items?.length) {
      const ids = items.map(i => i.id)
      await supabase.from('bank_accounts').delete().in('plaid_item_id', ids)
      await supabase.from('plaid_items').delete().in('id', ids)
    }

    // Reset profile to pre-onboarding state
    await supabase.from('profiles').update({
      budget_style: null,
      monthly_income: null,
      income_frequency: null,
      notification_tone: 'gentle',
      onboarding_complete: false,
      onboarding_step: 0,
    }).eq('id', uid)

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('reset error:', err)
    const msg = err instanceof Error ? err.message : 'Reset failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
