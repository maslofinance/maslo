import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Creates a Stripe Issuing cardholder for the user — required before issuing a card.
// A cardholder represents the person whose name goes on the card.
export async function POST(request: Request) {
  try {
    const { userId, name, email, phoneNumber, address } = await request.json()

    if (!userId || !name || !email) {
      return NextResponse.json({ error: 'userId, name, and email required' }, { status: 400 })
    }

    const cardholder = await stripe.issuing.cardholders.create({
      name,
      email,
      phone_number: phoneNumber || undefined,
      type: 'individual',
      billing: {
        address: address || {
          // Sandbox default — replace with real address at onboarding
          line1: '123 Main St',
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94111',
          country: 'US',
        },
      },
    })

    // Store cardholder ID on the profile
    await supabase
      .from('profiles')
      .update({ stripe_cardholder_id: cardholder.id })
      .eq('id', userId)

    return NextResponse.json({ cardholder, created: true })
  } catch (err: any) {
    console.error('Cardholder create error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
