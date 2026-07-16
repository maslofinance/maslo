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

    // Create a Financial Connections session requesting balances, ownership, and transactions
    const session = await stripe.financialConnections.sessions.create({
      account_holder: {
        type: 'customer',
        // In production this would be a real Stripe customer ID tied to the user.
        // For sandbox testing we use 'individual' type with a temporary customer.
        customer: await getOrCreateStripeCustomer(userId),
      },
      permissions: ['balances', 'ownership', 'transactions'],
      prefetch: ['balances', 'ownership'],
      filters: {
        // Only link US depository accounts (checking + savings)
        account_subcategories: ['checking', 'savings'],
        countries: ['US'],
      },
    })

    return NextResponse.json({
      client_secret: session.client_secret,
      session_id: session.id,
    })
  } catch (err: any) {
    console.error('Financial Connections session error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  // Check if we already have a Stripe customer ID stored for this user
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single()

  if (profile?.stripe_customer_id) {
    return profile.stripe_customer_id
  }

  // Create a new Stripe customer
  const customer = await stripe.customers.create({
    metadata: { supabase_user_id: userId },
  })

  // Persist the customer ID — best effort, don't fail the request if this errors
  await supabase
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('id', userId)

  return customer.id
}
