/**
 * /api/checkout.ts  — Vercel Edge-compatible serverless function
 *
 * POST  { action:"checkout", priceId, planKey, billing, topupKey?, email?, successUrl, cancelUrl }
 *   → { url }   — Stripe hosted checkout URL
 *
 * POST  { action:"portal", customerId, returnUrl }
 *   → { url }   — Stripe customer portal URL
 */

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { action = "checkout" } = body;

    // ── Customer Portal ────────────────────────────────────────────────────
    if (action === "portal") {
      const { customerId, returnUrl } = body;
      if (!customerId) {
        return json({ error: "customerId is required" }, 400);
      }
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl || process.env.NEXT_PUBLIC_SITE_URL || "https://localhost:3000",
      });
      return json({ url: session.url });
    }

    // ── Checkout Session ───────────────────────────────────────────────────
    const { priceId, planKey, billing, topupKey, email, successUrl, cancelUrl } = body;

    if (!priceId) return json({ error: "priceId is required" }, 400);

    const isTopup = !!topupKey;
    const isRecurring = !isTopup;

    // Optionally find/create customer by email for continuity
    let customerId: string | undefined;
    if (email) {
      const existing = await stripe.customers.list({ email, limit: 1 });
      customerId = existing.data[0]?.id;
      if (!customerId) {
        const created = await stripe.customers.create({ email });
        customerId = created.id;
      }
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: isRecurring ? "subscription" : "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl || `${process.env.NEXT_PUBLIC_SITE_URL}/?checkout=success`,
      cancel_url:  cancelUrl  || `${process.env.NEXT_PUBLIC_SITE_URL}/?checkout=cancel`,
      metadata: {
        planKey,
        billing: billing || "monthly",
        ...(topupKey ? { topupKey } : {}),
      },
      ...(customerId ? { customer: customerId } : email ? { customer_email: email } : {}),
      ...(isRecurring ? {
        subscription_data: {
          
          metadata: { planKey, billing: billing || "monthly" },
        },
      } : {}),
      allow_promotion_codes: true,
    };

    const session = await stripe.checkout.sessions.create(sessionParams);
    return json({ url: session.url, sessionId: session.id });

  } catch (err: any) {
    console.error("[/api/checkout]", err);
    return json({ error: err.message || "Internal server error" }, 500);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const config = { runtime: "edge" };