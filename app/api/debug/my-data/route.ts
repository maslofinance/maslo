import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'No auth' }, { status: 401 })
  }

  const token = auth.slice(7)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const [fcRes, profileRes] = await Promise.all([
    supabase.from('stripe_fc_accounts').select('*').eq('user_id', user.id),
    supabase.from('profiles').select('monthly_income, onboarding_complete, onboarding_step').eq('id', user.id).single(),
  ])

  return NextResponse.json({
    user_id: user.id,
    stripe_fc_accounts: { data: fcRes.data, error: fcRes.error?.message },
    profile: { data: profileRes.data, error: profileRes.error?.message },
    service_role_key_set: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  })
}
