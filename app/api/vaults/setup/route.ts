import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VAULT_TEMPLATE = [
  { priority: 1, name: 'Rent',           icon: '🏡', category: 'essentials', lock_type: 'hard_lock',  target_amount: 1705,  due_day: 1,    description: 'Non-negotiable. Funded first.' },
  { priority: 2, name: 'Groceries',      icon: '🍜', category: 'essentials', lock_type: 'soft_lock',  target_amount: 800,   due_day: null, description: 'Food. Always approved.' },
  { priority: 3, name: 'Utilities',      icon: '⚡', category: 'essentials', lock_type: 'soft_lock',  target_amount: 150,   due_day: null, description: 'Electric, internet, phone.' },
  { priority: 4, name: 'Car Payment',    icon: '🚗', category: 'essentials', lock_type: 'hard_lock',  target_amount: 417,   due_day: 7,    description: 'Due 7th of month.' },
  { priority: 5, name: 'Car Insurance',  icon: '🛡️', category: 'essentials', lock_type: 'hard_lock',  target_amount: 0,     due_day: null, description: 'Set your monthly amount.' },
  { priority: 6, name: 'Health Insurance', icon: '🏥', category: 'essentials', lock_type: 'hard_lock', target_amount: 0,   due_day: null, description: 'Set your monthly amount.' },
  { priority: 7, name: 'Dental Insurance', icon: '🦷', category: 'essentials', lock_type: 'hard_lock', target_amount: 0,   due_day: null, description: 'Set your monthly amount.' },
  { priority: 8, name: 'Debt',           icon: '💳', category: 'debt',       lock_type: 'hard_lock',  target_amount: 0,     due_day: null, description: 'Highest interest first. Kill the drain.' },
  { priority: 9, name: 'Emergency Fund', icon: '🛟', category: 'future',     lock_type: 'flexible',   target_amount: 10266, due_day: null, description: '3 months expenses. Priority #1 for savings.' },
  { priority: 10, name: 'Investments',   icon: '📈', category: 'future',     lock_type: 'flexible',   target_amount: 0,     due_day: null, description: 'IRA, HSA, brokerage. Building wealth.' },
  { priority: 11, name: 'Fun Money',     icon: '🎉', category: 'lifestyle',  lock_type: 'flexible',   target_amount: 0,     due_day: null, description: 'Whatever is left. Guilt free.' },
]

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const token = auth.slice(7)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Get existing vaults so we don't duplicate
    const { data: existing } = await supabase
      .from('vaults')
      .select('name, priority')
      .eq('user_id', user.id)
      .eq('is_active', true)

    const existingNames = new Set((existing ?? []).map(v => v.name.toLowerCase()))

    const toInsert = VAULT_TEMPLATE
      .filter(v => !existingNames.has(v.name.toLowerCase()))
      .map(v => ({
        ...v,
        user_id: user.id,
        current_balance: 0,
        is_active: true,
        is_locked: false,
        whitelisted_merchant: null,
      }))

    if (toInsert.length === 0) {
      return NextResponse.json({ created: 0, message: 'All vaults already exist' })
    }

    const { error } = await supabase.from('vaults').insert(toInsert)
    if (error) throw error

    return NextResponse.json({ created: toInsert.length, vaults: toInsert.map(v => v.name) })
  } catch (err: any) {
    console.error('vault setup error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
