import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

    const { accountId } = await request.json()
    if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 })

    const { error } = await supabase
      .from('stripe_fc_accounts')
      .delete()
      .eq('id', accountId)
      .eq('user_id', user.id) // ensure user owns this account

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('unlink-account error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
