import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const { userId, cardholderId } = await request.json()

    if (!userId || !cardholderId) {
      return NextResponse.json({ error: 'userId and cardholderId required' }, { status: 400 })
    }

    // Check for existing card
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_card_id')
      .eq('id', userId)
      .single()

    if (profile?.stripe_card_id) {
      const existing = await stripe.issuing.cards.retrieve(profile.stripe_card_id)
      return NextResponse.json({ card: existing, created: false })
    }

    // Issue a virtual card for this cardholder.
    // spending_controls defines what categories can be charged — we approve all for now
    // and enforce Maslo's vault logic in the real-time authorization webhook instead.
    const card = await stripe.issuing.cards.create({
      cardholder: cardholderId,
      currency: 'usd',
      type: 'virtual',
      status: 'active',
      spending_controls: {
        // No Stripe-level category blocks — Maslo's webhook handles all approve/deny logic
        spending_limits: [],
      },
    })

    // Store card ID
    await supabase
      .from('profiles')
      .update({ stripe_card_id: card.id })
      .eq('id', userId)

    return NextResponse.json({ card, created: true })
  } catch (err: any) {
    console.error('Card create error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const cardId = searchParams.get('card_id')
    const userId = searchParams.get('user_id')

    if (cardId) {
      // include=number,cvc returns the full PAN for display (only works in sandbox)
      const card = await stripe.issuing.cards.retrieve(cardId, {
        expand: ['number', 'cvc'],
      })
      return NextResponse.json({ card })
    }

    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('stripe_card_id')
        .eq('id', userId)
        .single()

      if (!profile?.stripe_card_id) {
        return NextResponse.json({ card: null })
      }

      const card = await stripe.issuing.cards.retrieve(profile.stripe_card_id, {
        expand: ['number', 'cvc'],
      })
      return NextResponse.json({ card })
    }

    return NextResponse.json({ error: 'card_id or user_id required' }, { status: 400 })
  } catch (err: any) {
    console.error('Card retrieve error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
