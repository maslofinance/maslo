import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const token = auth.slice(7)
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: accounts } = await supabase
    .from('stripe_fc_accounts')
    .select('id, stripe_account_id, name, subtype, current_balance, available_balance')
    .eq('user_id', user.id)
    .eq('is_active', true)

  const details = await Promise.all((accounts ?? []).map(async (row) => {
    try {
      const account = await stripe.financialConnections.accounts.retrieve(
        row.stripe_account_id,
        { expand: ['balance'] }
      ) as any
      return {
        name: row.name,
        subtype: row.subtype,
        supabase_current: row.current_balance,
        supabase_available: row.available_balance,
        stripe_balance_raw: account.balance,
        balance_refresh_status: account.balance_refresh?.status,
        balance_refresh_last_attempted: account.balance_refresh?.last_attempted_at,
        account_status: account.status,
      }
    } catch (e: any) {
      return { name: row.name, error: e.message }
    }
  }))

  return NextResponse.json(details)
}
