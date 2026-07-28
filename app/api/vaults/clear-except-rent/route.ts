import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// One-time cleanup: delete all vaults except the rent/housing vault
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const token = auth.slice(7)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: vaults } = await supabase
      .from('vaults')
      .select('id, name, category')
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (!vaults?.length) return NextResponse.json({ deleted: 0 })

    const rentVault = vaults.find(v => /rent|housing|apartment|home|lease/i.test(v.name))
    const toDelete = vaults.filter(v => v.id !== rentVault?.id).map(v => v.id)

    if (toDelete.length) {
      await supabase.from('allocation_rules').delete().in('vault_id', toDelete)
      await supabase.from('vaults').delete().in('id', toDelete)
    }

    return NextResponse.json({ deleted: toDelete.length, kept: rentVault?.name ?? 'none' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
