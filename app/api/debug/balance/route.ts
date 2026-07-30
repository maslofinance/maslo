import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { stripe } from '@/lib/stripe'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  // Try cookie-based auth (browser session)
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })

  const { data: accounts } = await adminSupabase
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
        account_status: account.status,
      }
    } catch (e: any) {
      return { name: row.name, error: e.message }
    }
  }))

  return NextResponse.json(details)
}
