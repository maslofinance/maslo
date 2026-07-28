import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Called after every balance sync.
// Allocates the user's total checking balance across vaults in priority order.
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const token = auth.slice(7)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Sum available balance across all active checking accounts
    const { data: accounts } = await supabase
      .from('stripe_fc_accounts')
      .select('available_balance, current_balance, subtype')
      .eq('user_id', user.id)
      .eq('is_active', true)

    const checkingAccounts = (accounts ?? []).filter(a => a.subtype === 'checking' || a.subtype === null)
    const totalChecking = checkingAccounts.reduce((sum, a) => {
      return sum + (a.available_balance ?? a.current_balance ?? 0)
    }, 0)

    // Load vaults in priority order
    const { data: vaults } = await supabase
      .from('vaults')
      .select('id, priority, target_amount, category')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('priority', { ascending: true })

    if (!vaults?.length) return NextResponse.json({ funded: 0 })

    // Waterfall: fill each vault up to its target in priority order
    let remaining = totalChecking
    const updates = vaults.map(vault => {
      const allocated = Math.min(remaining, vault.target_amount)
      remaining = Math.max(0, remaining - vault.target_amount)
      return { id: vault.id, current_balance: Math.round(allocated * 100) / 100 }
    })

    await Promise.all(updates.map(u =>
      supabase.from('vaults').update({ current_balance: u.current_balance }).eq('id', u.id)
    ))

    return NextResponse.json({ funded: updates.length, total_checking: totalChecking })
  } catch (err: any) {
    console.error('vault fund error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
