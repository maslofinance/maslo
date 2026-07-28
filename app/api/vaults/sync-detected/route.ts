import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface DetectedItem {
  amount: string   // e.g. "1705.23"
  due_day?: string // e.g. "1"
}

interface SyncPayload {
  rent?: DetectedItem
  cars?: DetectedItem[]
  utilities?: DetectedItem[]
  insurances?: DetectedItem[]
}

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const token = auth.slice(7)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payload: SyncPayload = await req.json()

    const { data: vaults } = await supabase
      .from('vaults')
      .select('id, category, name, target_amount, due_day')
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (!vaults?.length) return NextResponse.json({ updated: 0 })

    const updates: { id: string; target_amount?: number; due_day?: number }[] = []

    // Match rent → first essentials vault whose name suggests rent/housing
    if (payload.rent) {
      const rentVault = vaults.find(v =>
        v.category === 'essentials' &&
        /rent|housing|apartment|home|lease/i.test(v.name)
      ) ?? vaults.find(v => v.category === 'essentials')

      if (rentVault) {
        updates.push({
          id: rentVault.id,
          target_amount: parseFloat(payload.rent.amount),
          ...(payload.rent.due_day ? { due_day: parseInt(payload.rent.due_day) } : {}),
        })
      }
    }

    // Match car payments → debt vaults with car/auto/vehicle in name
    if (payload.cars?.length) {
      const carVaults = vaults.filter(v =>
        v.category === 'essentials' &&
        /car|auto|vehicle|loan|ally|toyota|honda|ford/i.test(v.name)
      )
      payload.cars.forEach((car, i) => {
        const vault = carVaults[i]
        if (vault) {
          updates.push({
            id: vault.id,
            target_amount: parseFloat(car.amount),
            ...(car.due_day ? { due_day: parseInt(car.due_day) } : {}),
          })
        }
      })
    }

    await Promise.all(updates.map(u => {
      const { id, ...fields } = u
      return supabase.from('vaults').update(fields).eq('id', id)
    }))

    return NextResponse.json({ updated: updates.length })
  } catch (err: any) {
    console.error('sync-detected error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
