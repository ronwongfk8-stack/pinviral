/**
 * /api/checkout.ts
 * POST { action:"checkout", priceId, planKey, billing, topupKey?, email?, successUrl, cancelUrl }
 *   → { url }
 * POST { action:"portal", customerId, returnUrl }
 *   → { url }
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { runtime: "nodejs" };

const SK = process.env.STRIPE_SECRET_KEY || process.env.VITE_STRIPE_SECRET_KEY!;

async function stripePost(endpoint: string, params: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SK}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json() as any;
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`);
  return data;
}

async function stripeGet(endpoint: string) {
  const res = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    headers: { Authorization: `Bearer ${SK}` },
  });
  const data = await res.json() as any;
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`);
  return data;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!SK) return res.status(500).json({ error: "STRIPE_SECRET_KEY not set" });

  try {
    const body = req.body;
    const action = body.action || "checkout";

    // Billing portal
    if (action === "portal") {
      const { customerId, returnUrl } = body;
      if (!customerId) return res.status(400).json({ error: "customerId required" });
      const session = await stripePost("billing_portal/sessions", {
        customer: customerId,
        return_url: returnUrl || "",
      });
      return res.status(200).json({ url: session.url });
    }

    // Cancel subscription
    if (action === "cancel") {
      const { subscriptionId } = body;
      if (!subscriptionId) return res.status(400).json({ error: "subscriptionId required" });
      await stripePost(`subscriptions/${subscriptionId}`, { cancel_at_period_end: "true" });
      return res.status(200).json({ cancelled: true });
    }

    // Checkout session
    const { priceId, planKey, billing, topupKey, email, successUrl, cancelUrl } = body;
    if (!priceId) return res.status(400).json({ error: "priceId required" });

    const isRecurring = !topupKey;

    let customerId: string | undefined;
    if (email) {
      try {
        const existing = await stripeGet(`customers/search?query=email:'${encodeURIComponent(email)}'&limit=1`);
        customerId = existing.data?.[0]?.id;
        if (!customerId) {
          const created = await stripePost("customers", { email });
          customerId = created.id;
        }
      } catch {}
    }

    const params: Record<string, string> = {
      mode:                      isRecurring ? "subscription" : "payment",
      "line_items[0][price]":    priceId,
      "line_items[0][quantity]": "1",
      success_url:               successUrl,
      cancel_url:                cancelUrl,
      allow_promotion_codes:     "true",
      "metadata[planKey]":       planKey || "",
      "metadata[billing]":       billing || "monthly",
    };
    if (topupKey)    params["metadata[topupKey]"]  = topupKey;
    if (customerId)  params["customer"]             = customerId;
    else if (email)  params["customer_email"]       = email;

    const session = await stripePost("checkout/sessions", params);
    return res.status(200).json({ url: session.url, sessionId: session.id });

  } catch (err: any) {
    console.error("[/api/checkout]", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}