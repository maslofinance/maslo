import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    // Don't create a duplicate if one already exists for this user
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, stripe_treasury_account_id')
      .eq('id', userId)
      .single()

    if (profile?.stripe_treasury_account_id) {
      const existing = await stripe.treasury.financialAccounts.retrieve(
        profile.stripe_treasury_account_id
      )
      return NextResponse.json({ financial_account: existing, created: false })
    }

    if (!profile?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No Stripe customer found for this user. Create a Financial Connections session first.' },
        { status: 400 }
      )
    }

    // Create the Treasury financial account for this user.
    // This is the Maslo-controlled account that the issued card draws from.
    // ACH transfers from the user's linked bank will fund this account.
    const financialAccount = await stripe.treasury.financialAccounts.create({
      supported_currencies: ['usd'],
      features: {
        // Allow card spend against this account
        card_issuing: { requested: true },
        // Allow ACH deposits from the user's linked bank
        deposit_insurance: { requested: true },
        financial_addresses: { aba: { requested: true } },
        // Allow outbound ACH (for debt payments in Phase 2)
        outbound_transfers: { ach: { requested: true }, us_domestic_wire: { requested: true } },
        // Allow inbound ACH from linked bank
        inbound_transfers: { ach: { requested: true } },
      },
    }, {
      // Stripe Connect: financial accounts are owned by the connected account (the user).
      // In sandbox without Connect, this creates the FA on the platform account for testing.
      stripeAccount: undefined,
    })

    // Store the financial account ID on the user's profile
    await supabase
      .from('profiles')
      .update({ stripe_treasury_account_id: financialAccount.id })
      .eq('id', userId)

    return NextResponse.json({ financial_account: financialAccount, created: true })
  } catch (err: any) {
    console.error('Treasury financial account error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id')
    const accountId = searchParams.get('account_id')

    if (accountId) {
      const fa = await stripe.treasury.financialAccounts.retrieve(accountId, {
        expand: ['financial_addresses', 'balance'],
      })
      return NextResponse.json({ financial_account: fa })
    }

    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('stripe_treasury_account_id')
        .eq('id', userId)
        .single()

      if (!profile?.stripe_treasury_account_id) {
        return NextResponse.json({ financial_account: null })
      }

      const fa = await stripe.treasury.financialAccounts.retrieve(
        profile.stripe_treasury_account_id,
        { expand: ['financial_addresses', 'balance'] }
      )
      return NextResponse.json({ financial_account: fa })
    }

    return NextResponse.json({ error: 'user_id or account_id required' }, { status: 400 })
  } catch (err: any) {
    console.error('Treasury financial account GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
