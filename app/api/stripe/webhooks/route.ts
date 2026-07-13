import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { mapMccToVaultCategory } from '@/lib/vault-categorization'
import Stripe from 'stripe'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  let event: Stripe.Event

  if (process.env.STRIPE_WEBHOOK_SECRET && sig) {
    try {
      event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }
  } else {
    event = JSON.parse(body)
  }

  switch (event.type) {
    case 'issuing_authorization.request':
      return handleAuthorizationRequest(event.data.object as Stripe.Issuing.Authorization)

    case 'issuing_authorization.created':
      logAuthorization(event.data.object as Stripe.Issuing.Authorization)
      break

    case 'financial_connections.account.refreshed_transactions':
      console.log('[FC] Transactions refreshed for account:', (event.data.object as any).id)
      break

    default:
      console.log(`[Webhook] Unhandled event type: ${event.type}`)
  }

  return NextResponse.json({ received: true })
}

// ---------------------------------------------------------------------------
// Real-time authorization — Stripe gives us ~2 seconds to respond APPROVE or DECLINE.
// ---------------------------------------------------------------------------
async function handleAuthorizationRequest(
  authorization: Stripe.Issuing.Authorization
): Promise<NextResponse> {
  const cardId = authorization.card.id
  const amountCents = authorization.amount
  const merchantCategory = authorization.merchant_data.category
  const merchantName = authorization.merchant_data.name
  const amountDollars = amountCents / 100

  console.log(`[Auth] ${merchantName} | $${amountDollars.toFixed(2)} | MCC: ${merchantCategory}`)

  try {
    // 1. Find the user by card ID
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, notification_tone')
      .eq('stripe_card_id', cardId)
      .single()

    if (!profile) {
      console.error(`[Auth] No profile found for card ${cardId} — declining`)
      return approveOrDecline(authorization.id, false, 'card_not_active')
    }

    // 2. Map MCC to vault category
    const vaultCategory = mapMccToVaultCategory(merchantCategory)

    // 3. Check vault balance — uses real schema: category (enum), current_balance, lock_type
    const { data: vault } = await supabase
      .from('vaults')
      .select('id, current_balance, category, lock_type')
      .eq('user_id', profile.id)
      .eq('category', vaultCategory)
      .eq('is_active', true)
      .single()

    const vaultBalance = Number(vault?.current_balance ?? 0)
    const isHardLocked = vault?.lock_type === 'hard_lock'

    console.log(`[Auth] Vault: ${vaultCategory} | Balance: $${vaultBalance} | Hard lock: ${isHardLocked} | Charge: $${amountDollars}`)

    // 4. Enforce vault logic
    // Hard-locked vaults always block. Otherwise check if funds are available.
    const approved = !isHardLocked && vaultBalance >= amountDollars

    if (!approved) {
      const reason = isHardLocked ? 'hard_lock' : 'insufficient_funds'
      console.log(`[Auth] DECLINED — ${vaultCategory} vault (${reason})`)
    } else {
      console.log(`[Auth] APPROVED — ${vaultCategory} vault has sufficient funds`)
    }

    // 5. Log to transactions table using real schema
    const today = new Date().toISOString().split('T')[0]
    await supabase.from('transactions').insert({
      user_id: profile.id,
      vault_id: vault?.id ?? null,
      amount: amountDollars,
      date: today,
      merchant_name: merchantName,
      description: `${merchantName} — ${vaultCategory}`,
      category: vaultCategory,
      status: approved ? 'approved' : 'denied',
      maslo_decision_reason: approved ? null : (isHardLocked ? 'Vault is hard locked' : `Vault balance $${vaultBalance} insufficient for $${amountDollars} charge`),
      is_pending: false,
    })

    return approveOrDecline(authorization.id, approved, approved ? undefined : (isHardLocked ? 'hard_lock' : 'insufficient_funds'))

  } catch (err: any) {
    // On internal error default to APPROVE — never block a legitimate charge due to our bug
    console.error('[Auth] Internal error — defaulting to approve:', err.message)
    return approveOrDecline(authorization.id, true)
  }
}

async function approveOrDecline(
  authorizationId: string,
  approve: boolean,
  reason?: string
): Promise<NextResponse> {
  if (approve) {
    await stripe.issuing.authorizations.approve(authorizationId, {
      metadata: { maslo_decision: 'approved' },
    })
  } else {
    await stripe.issuing.authorizations.decline(authorizationId, {
      metadata: { maslo_decision: 'declined', reason: reason ?? 'vault_check_failed' },
    })
  }

  return NextResponse.json({ approved: approve })
}

function logAuthorization(authorization: Stripe.Issuing.Authorization) {
  const status = (authorization as any).approved ? 'APPROVED' : 'DECLINED'
  console.log(`[Auth Created] ${status} | ${authorization.merchant_data.name} | $${(authorization.amount / 100).toFixed(2)}`)
}

