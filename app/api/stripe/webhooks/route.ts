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

    case 'financial_connections.account.refreshed_balance':
      await handleBalanceRefreshed(event.data.object as any)
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
//
// Locking model (Section 2-4, MASLO_CONTEXT_8):
//   - Locked money → only the whitelisted merchant for that vault can charge it
//   - Unlocked money → spend freely on anything
//   - A merchant matching a locked vault's whitelist → APPROVE (expected payment)
//   - Any other merchant → APPROVE (free spending from unlocked funds)
//   - Future: when Maslo Treasury is live, enforce that unlocked balance covers charge
// ---------------------------------------------------------------------------
async function handleAuthorizationRequest(
  authorization: Stripe.Issuing.Authorization
): Promise<NextResponse> {
  const cardId = authorization.card.id
  const amountCents = authorization.amount
  const merchantName = (authorization.merchant_data.name ?? '').toLowerCase().trim()
  const amountDollars = amountCents / 100

  console.log(`[Auth] ${merchantName} | $${amountDollars.toFixed(2)}`)

  try {
    // 1. Find user by card ID
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, notification_tone')
      .eq('stripe_card_id', cardId)
      .single()

    if (!profile) {
      console.error(`[Auth] No profile for card ${cardId} — declining`)
      return approveOrDecline(authorization.id, false, 'card_not_active')
    }

    // 2. Load all locked vaults for this user
    const { data: lockedVaults } = await supabase
      .from('vaults')
      .select('id, name, whitelisted_merchant, target_amount')
      .eq('user_id', profile.id)
      .eq('is_locked', true)
      .eq('is_active', true)

    // 3. Check if merchant matches any locked vault's whitelist
    const matchedVault = (lockedVaults ?? []).find(v => {
      const wl = (v.whitelisted_merchant ?? '').toLowerCase().trim()
      return wl && (merchantName.includes(wl) || wl.includes(merchantName))
    })

    let approved = true
    let reason = ''
    let matchedVaultId: string | null = null

    if (matchedVault) {
      // Whitelisted merchant for a locked vault — always approve
      approved = true
      matchedVaultId = matchedVault.id
      reason = `Whitelisted for ${matchedVault.name} vault`
      console.log(`[Auth] APPROVED — whitelisted merchant for vault: ${matchedVault.name}`)
    } else {
      // Not whitelisted — approve as free spending from unlocked funds
      // (Phase 2: enforce unlocked balance check via Maslo Treasury)
      approved = true
      reason = 'Unlocked spending'
      console.log(`[Auth] APPROVED — unlocked spending`)
    }

    // 4. Log transaction
    const today = new Date().toISOString().split('T')[0]
    await supabase.from('transactions').insert({
      user_id: profile.id,
      vault_id: matchedVaultId,
      amount: amountDollars,
      date: today,
      merchant_name: authorization.merchant_data.name,
      description: authorization.merchant_data.name ?? 'Card purchase',
      category: matchedVault ? 'essentials' : 'lifestyle',
      status: 'approved',
      maslo_decision_reason: reason,
      is_pending: false,
    })

    return approveOrDecline(authorization.id, true)

  } catch (err: any) {
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

async function handleBalanceRefreshed(fcAccount: any) {
  const accountId = fcAccount.id
  console.log('[FC] Balance refreshed for account:', accountId, 'status:', fcAccount.balance_refresh?.status)

  if (fcAccount.balance_refresh?.status !== 'succeeded') return

  try {
    const account = await stripe.financialConnections.accounts.retrieve(accountId, { expand: ['balance'] })
    const currentBalance = account?.balance?.current
      ? Object.values(account.balance.current as Record<string, number>)[0] / 100
      : null
    const availableBalance = (account?.balance as any)?.cash?.available
      ? Object.values((account.balance as any).cash.available as Record<string, number>)[0] / 100
      : null

    console.log('[FC] Updating balance in Supabase:', { accountId, currentBalance, availableBalance })

    await (supabase as any)
      .from('stripe_fc_accounts')
      .update({ current_balance: currentBalance, available_balance: availableBalance, last_synced_at: new Date().toISOString() })
      .eq('stripe_account_id', accountId)
  } catch (err: any) {
    console.error('[FC] Failed to update balance after refresh:', err.message)
  }
}

function logAuthorization(authorization: Stripe.Issuing.Authorization) {
  const status = (authorization as any).approved ? 'APPROVED' : 'DECLINED'
  console.log(`[Auth Created] ${status} | ${authorization.merchant_data.name} | $${(authorization.amount / 100).toFixed(2)}`)
}

