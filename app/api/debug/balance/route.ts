import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// No auth — temp debug endpoint, returns all FC accounts balance data
export async function GET() {
  const { data: accounts } = await adminSupabase
    .from('stripe_fc_accounts')
    .select('id, stripe_account_id, name, subtype, current_balance, available_balance, user_id')
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
        account_status: account.status,
      }
    } catch (e: any) {
      return { name: row.name, error: e.message }
    }
  }))

  return NextResponse.json(details)
}
