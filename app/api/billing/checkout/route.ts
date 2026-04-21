// app/api/billing/checkout/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { PLANS, TOP_UP_PACKS } from '@/types/billing';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mode, planId, addonId, email } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    let session;

    if (mode === 'plan' && planId) {
      const plan = PLANS.find(p => p.id === planId);
      if (!plan) {
        return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
      }

      const priceId = getStripePriceId(planId);

      session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        customer_email: email,
        success_url: `${process.env.NEXT_PUBLIC_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.NEXT_PUBLIC_URL}/payment/cancel`,
        metadata: {
          type: 'subscription',
          planId: plan.id,
          userEmail: email,
        },
      });

    } else if (mode === 'addon' && addonId) {
      const pack = TOP_UP_PACKS.find(p => p.id === addonId);
      if (!pack) {
        return NextResponse.json({ error: 'Invalid addon' }, { status: 400 });
      }

      session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${pack.generations} Generations Top-up`,
              description: `One-time purchase of ${pack.generations} creation credits`,
            },
            unit_amount: pack.price * 100,
          },
          quantity: 1,
        }],
        customer_email: email,
        success_url: `${process.env.NEXT_PUBLIC_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.NEXT_PUBLIC_URL}/payment/cancel`,
        metadata: {
          type: 'topup',
          addonId: pack.id,
          generations: pack.generations.toString(),
          userEmail: email,
        },
      });
    } else {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}

function getStripePriceId(planId: string): string {
  const priceMap: Record<string, string> = {
    'starter': process.env.STRIPE_STARTER_PRICE_ID!,
    'pro': process.env.STRIPE_PRO_PRICE_ID!,
    'scale': process.env.STRIPE_SCALE_PRICE_ID!,
  };

  const priceId = priceMap[planId];
  if (!priceId) {
    throw new Error(`No Stripe price ID configured for plan: ${planId}`);
  }

  return priceId;
}