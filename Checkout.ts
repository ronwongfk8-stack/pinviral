// api/checkout.ts — Stripe checkout, cancellation, and portal — server-side only
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db, getOrCreateUser } from "../lib/db";

const STRIPE_SK = process.env.STRIPE_SECRET_KEY || "";

async function stripePost(endpoint: string, params: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SK}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe error ${res.status}`);
  return data;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!STRIPE_SK) return res.status(500).json({ error: "Stripe not configured on server" });

  try {
    const body = req.body as any;

    // ── Cancel subscription ─────────────────────────────────────────────────
    if (body.action === "cancel") {
      if (!body.subscriptionId) return res.status(400).json({ error: "subscriptionId required" });
      await stripePost(`subscriptions/${body.subscriptionId}`, { "cancel_at_period_end": "true" });
      return res.status(200).json({ cancelled: true });
    }

    // ── Billing portal ──────────────────────────────────────────────────────
    if (body.action === "portal") {
      if (!body.customerId) return res.status(400).json({ error: "customerId required" });
      const portal = await stripePost("billing_portal/sessions", {
        customer:   body.customerId,
        return_url: body.returnUrl || `${req.headers.origin || ""}/?portal=return`,
      });
      return res.status(200).json({ url: portal.url });
    }

    // ── New checkout session ────────────────────────────────────────────────
    const { priceId, planKey, billing, topupKey, email, successUrl, cancelUrl } = body as {
      priceId: string;
      planKey: string;
      billing: "monthly" | "annual";
      topupKey?: string;
      email?: string;
      successUrl: string;
      cancelUrl: string;
    };

    if (!priceId || !successUrl || !cancelUrl) {
      return res.status(400).json({ error: "priceId, successUrl, cancelUrl are required" });
    }

    const isSubscription = !topupKey;
    let stripeCustomerId: string | undefined;

    if (email) {
      try {
        const user = await getOrCreateUser(email);
        stripeCustomerId = user.stripe_customer_id || undefined;
        if (!stripeCustomerId) {
          const customer = await stripePost("customers", { email, "metadata[supabase_id]": user.id });
          stripeCustomerId = customer.id;
          await db.from("users").update({ stripe_customer_id: customer.id }).eq("id", user.id);
        }
      } catch (e) {
        console.error("User lookup failed:", e);
      }
    }

    const sessionParams: Record<string, string> = {
      "payment_method_types[]": "card",
      "line_items[0][price]":    priceId,
      "line_items[0][quantity]": "1",
      success_url: successUrl,
      cancel_url:  cancelUrl,
      mode: isSubscription ? "subscription" : "payment",
      ...(topupKey ? { "metadata[topup_key]": topupKey } : {}),
      ...(planKey  ? { "metadata[plan_key]":  planKey  } : {}),
      ...(billing  ? { "metadata[billing]":   billing  } : {}),
    };

    if (stripeCustomerId) sessionParams["customer"] = stripeCustomerId;
    else if (email)        sessionParams["customer_email"] = email;

    const session = await stripePost("checkout/sessions", sessionParams);
    res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Checkout failed" });
  }
}