import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/supabase-server'
import { plaidClient } from '@/lib/plaid'
import { CountryCode, Products } from 'plaid'

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: user.id },
      client_name: 'Maslo Finance',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    })

    return NextResponse.json({ link_token: response.data.link_token })
  } catch (err: unknown) {
    console.error('link-token error:', err)
    const message = err instanceof Error ? err.message : 'Failed to create link token'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
