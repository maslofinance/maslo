import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, getRequestUser } from '@/lib/supabase-server'

export interface VaultInput {
  name: string
  icon: string
  category: 'essentials' | 'debt' | 'future' | 'lifestyle'
  target_amount: number
  due_day?: number
  due_amount?: number
  lock_type: 'hard_lock' | 'soft_lock' | 'flexible'
  lender_name?: string        // for debt matching
  interest_rate?: number
  allocation_pct?: number     // % of income
  allocation_fixed?: number   // fixed $ amount
  description?: string
}

export interface OnboardingPayload {
  vaults: VaultInput[]
  monthly_income: number
  income_frequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'
  budget_style: 'liberal' | 'moderate' | 'aggressive'
  notification_tone: 'gentle' | 'sarcastic' | 'drill_sergeant' | 'shaman'
  onboarding_mode: 'hybrid' | 'learn' | 'jump_in'
}

// Priority ranges per category
const PRIORITY_BASE: Record<string, number> = {
  essentials: 100,
  debt: 200,
  future: 300,
  lifestyle: 400,
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const supabase = createServerClient()

    const payload: OnboardingPayload = await req.json()
    const { vaults, monthly_income, income_frequency, budget_style, notification_tone, onboarding_mode } = payload

    // ── 1. Update profile ─────────────────────────────────────────
    await supabase.from('profiles').update({
      monthly_income,
      income_frequency,
      budget_style,
      notification_tone,
      onboarding_complete: onboarding_mode !== 'hybrid', // hybrid stays in learning mode
      onboarding_step: 9,
    }).eq('id', user.id)

    // ── 2. Clear existing vaults / rules ──────────────────────────
    const { data: existingVaults } = await supabase.from('vaults').select('id').eq('user_id', user.id)
    if (existingVaults?.length) {
      const ids = existingVaults.map(v => v.id)
      await supabase.from('allocation_rules').delete().in('vault_id', ids)
      await supabase.from('vaults').delete().in('id', ids)
    }

    // ── 3. Create vaults ──────────────────────────────────────────
    const catCounters: Record<string, number> = {}
    const vaultRows = vaults.map(v => {
      catCounters[v.category] = (catCounters[v.category] ?? 0) + 1
      return {
        user_id: user.id,
        name: v.name,
        icon: v.icon,
        category: v.category,
        priority: PRIORITY_BASE[v.category] + (catCounters[v.category] - 1),
        target_amount: v.target_amount,
        current_balance: 0,
        lock_type: v.lock_type,
        due_day: v.due_day ?? null,
        due_amount: v.due_amount ?? null,
        description: v.description ?? null,
        is_active: true,
        is_system: true,
      }
    })

    const { data: createdVaults, error: vaultErr } = await supabase
      .from('vaults')
      .insert(vaultRows)
      .select('id, name')

    if (vaultErr || !createdVaults) throw new Error(vaultErr?.message ?? 'Vault creation failed')

    // ── 4. Create allocation rules ────────────────────────────────
    const totalFixed = vaults
      .filter(v => v.allocation_fixed)
      .reduce((s, v) => s + (v.allocation_fixed ?? 0), 0)

    const lifestyleVaultIdx = vaults.findIndex(v => v.category === 'lifestyle')
    const ruleRows = vaults.map((v, i) => {
      const vaultId = createdVaults[i].id
      const isLifestyle = v.category === 'lifestyle' && i === lifestyleVaultIdx

      let rule_type: 'fixed' | 'percentage' | 'remainder' = 'fixed'
      let fixed_amount: number | null = null
      let percentage: number | null = null

      if (isLifestyle) {
        rule_type = 'remainder'
      } else if (v.allocation_fixed) {
        rule_type = 'fixed'
        fixed_amount = v.allocation_fixed
      } else if (v.allocation_pct) {
        rule_type = 'percentage'
        percentage = v.allocation_pct
      } else {
        rule_type = 'fixed'
        fixed_amount = v.target_amount
      }

      void totalFixed // used for future validation

      return {
        user_id: user.id,
        vault_id: vaultId,
        rule_type,
        fixed_amount,
        percentage,
        applies_to: 'all_income',
        is_active: true,
      }
    })

    await supabase.from('allocation_rules').insert(ruleRows)

    return NextResponse.json({
      success: true,
      vault_count: createdVaults.length,
      vaults: createdVaults,
    })
  } catch (err: unknown) {
    console.error('vault create error:', err)
    const msg = err instanceof Error ? err.message : 'Failed to create vaults'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
