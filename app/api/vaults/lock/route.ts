import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getRequestUser } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase = createServerClient()

    const { vault_id, lock, whitelisted_merchant } = await req.json()
    if (!vault_id) return NextResponse.json({ error: 'vault_id required' }, { status: 400 })

    const update: Record<string, unknown> = { is_locked: lock }
    if (lock) {
      if (!whitelisted_merchant?.trim()) {
        return NextResponse.json({ error: 'whitelisted_merchant required when locking' }, { status: 400 })
      }
      update.whitelisted_merchant = whitelisted_merchant.trim()
    } else {
      update.whitelisted_merchant = null
    }

    const { error } = await supabase
      .from('vaults')
      .update(update)
      .eq('id', vault_id)
      .eq('user_id', user.id) // ensure ownership

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('vault lock error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
