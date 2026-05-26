import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getRequestUser } from '@/lib/supabase-server'
import { plaidClient } from '@/lib/plaid'

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase = createServerClient()

    const { public_token, institution_name, institution_id } = await req.json()
    if (!public_token) {
      return NextResponse.json({ error: 'public_token required' }, { status: 400 })
    }

    // Exchange public token for access token
    const exchangeRes = await plaidClient.itemPublicTokenExchange({ public_token })
    const { access_token, item_id } = exchangeRes.data

    // Store in plaid_items (service role bypasses RLS — access_token stays server-side)
    const { data: item, error: dbError } = await supabase
      .from('plaid_items')
      .upsert({
        user_id: user.id,
        plaid_item_id: item_id,
        plaid_access_token: access_token,
        institution_name: institution_name ?? 'Unknown Bank',
        institution_id: institution_id ?? null,
        is_active: true,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'plaid_item_id' })
      .select('id')
      .single()

    if (dbError) throw new Error(dbError.message)

    // Fetch and store accounts
    const accountsRes = await plaidClient.accountsGet({ access_token })
    const accounts = accountsRes.data.accounts

    const accountRows = accounts.map(a => ({
      user_id: user.id,
      plaid_item_id: item!.id,
      plaid_account_id: a.account_id,
      name: a.name,
      official_name: a.official_name ?? null,
      type: mapAccountType(a.type),
      subtype: a.subtype ?? null,
      mask: a.mask ?? null,
      current_balance: a.balances.current ?? null,
      available_balance: a.balances.available ?? null,
      is_primary: a.type === 'depository',
      last_synced_at: new Date().toISOString(),
    }))

    await supabase.from('bank_accounts').upsert(accountRows, { onConflict: 'plaid_account_id' })

    return NextResponse.json({
      success: true,
      plaid_item_id: item!.id,
      accounts: accounts.map(a => ({
        id: a.account_id,
        name: a.name,
        type: a.type,
        subtype: a.subtype,
        balance: a.balances.current,
        mask: a.mask,
      })),
    })
  } catch (err: unknown) {
    console.error('exchange-token error:', err)
    const message = err instanceof Error ? err.message : 'Exchange failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

type AccountTypeEnum = 'checking' | 'savings' | 'credit' | 'loan' | 'investment' | 'other'

function mapAccountType(type: string): AccountTypeEnum {
  const map: Record<string, AccountTypeEnum> = {
    depository: 'checking',
    credit: 'credit',
    loan: 'loan',
    investment: 'investment',
    other: 'other',
  }
  return map[type] ?? 'other'
}
