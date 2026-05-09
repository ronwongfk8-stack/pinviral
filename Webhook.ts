// api/webhook.ts — Stripe webhook handler
// In Vercel: Settings → Environment Variables → STRIPE_WEBHOOK_SECRET=whsec_...
// In Stripe Dashboard: Developers → Webhooks → Add endpoint → https://yourdomain.com/api/webhook
// Events to listen: checkout.session.completed, customer.subscription.deleted, invoice.payment_failed

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db, PLAN_DEFS, TOPUP_PACKS, getUserByStripeCustomer, getUserByStripeSubscription } from "../lib/db";

const STRIPE_SK             = process.env.STRIPE_SECRET_KEY!;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

// Minimal Stripe signature verification without the Stripe SDK
async function verifyStripeSignature(
  rawBody: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const parts    = signature.split(",");
    const tPart    = parts.find((p) => p.startsWith("t="));
    const v1Part   = parts.find((p) => p.startsWith("v1="));
    if (!tPart || !v1Part) return false;

    const t        = tPart.slice(2);
    const v1       = v1Part.slice(3);
    const payload  = `${t}.${rawBody}`;

    const encoder  = new TextEncoder();
    const keyData  = encoder.encode(secret);
    const msgData  = encoder.encode(payload);

    const cryptoKey = await crypto.subtle.importKey(
      "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", cryptoKey, msgData);
    const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");

    return hex === v1;
  } catch {
    return false;
  }
}

async function stripeGet(endpoint: string) {
  const res = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    headers: { Authorization: `Bearer ${STRIPE_SK}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`);
  return data;
}

export const config = { api: { bodyParser: false } }; // need raw body for signature

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  // Read raw body
  const rawBody: string = await new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end",  () => resolve(body));
    req.on("error", reject);
  });

  const signature = req.headers["stripe-signature"] as string;

  if (STRIPE_WEBHOOK_SECRET) {
    const valid = await verifyStripeSignature(rawBody, signature, STRIPE_WEBHOOK_SECRET);
    if (!valid) {
      console.error("[webhook] Invalid signature");
      return res.status(400).json({ error: "Invalid signature" });
    }
  }

  const event = JSON.parse(rawBody);
  console.log("[webhook] event:", event.type);

  try {
    switch (event.type) {

      // ── Checkout completed (new subscription OR one-time top-up) ─────────
      case "checkout.session.completed": {
        const session   = event.data.object;
        const customerId = session.customer as string;
        const email      = session.customer_email || session.customer_details?.email;
        const meta       = session.metadata || {};
        const topupKey   = meta.topup_key as string | undefined;
        const planKey    = meta.plan_key   as string | undefined;
        const billing    = (meta.billing || "monthly") as "monthly" | "annual";

        // Find user by Stripe customer ID or email
        let user = customerId ? await getUserByStripeCustomer(customerId) : null;
        if (!user && email) {
          const { data } = await db.from("users").select("*").eq("email", email.toLowerCase()).single();
          user = data;
        }
        if (!user) {
          // Create user on the fly (first purchase without prior login)
          if (!email) break;
          const { data } = await db
            .from("users")
            .insert({ email: email.toLowerCase(), stripe_customer_id: customerId })
            .select()
            .single();
          user = data;
        }
        if (!user) break;

        // ── Top-up purchase ────────────────────────────────────────────────
        if (topupKey) {
          const pack = TOPUP_PACKS[topupKey];
          if (pack) {
            await db.from("users").update({
              images_left:  (user.images_left || 0) + pack.images,
              videos_left:  (user.videos_left || 0) + pack.videos,
              images_total: (user.images_total || 0) + pack.images,
              videos_total: (user.videos_total || 0) + pack.videos,
              stripe_customer_id: customerId || user.stripe_customer_id,
            }).eq("id", user.id);

            await db.from("topup_history").insert({
              user_id: user.id,
              label:   pack.label,
              images:  pack.images,
              videos:  pack.videos,
              amount_usd: pack.price,
            });
          }
          break;
        }

        // ── New subscription ───────────────────────────────────────────────
        if (planKey && PLAN_DEFS[planKey]) {
          const plan = PLAN_DEFS[planKey];
          const subId = session.subscription as string | undefined;

          // Fetch subscription for renewal date
          let expiresAt: string | null = null;
          if (subId) {
            try {
              const sub = await stripeGet(`subscriptions/${subId}`);
              expiresAt = new Date(sub.current_period_end * 1000).toISOString();
            } catch {}
          }

          await db.from("users").update({
            plan,
            billing,
            images_left:            plan.images,
            videos_left:            plan.videos,
            images_total:           plan.images,
            videos_total:           plan.videos,
            activated_at:           new Date().toISOString(),
            expires_at:             expiresAt,
            stripe_customer_id:     customerId || user.stripe_customer_id,
            stripe_subscription_id: subId || user.stripe_subscription_id,
          }).eq("id", user.id);
        }
        break;
      }

      // ── Subscription renewed (monthly / annual) ───────────────────────
      case "invoice.payment_succeeded": {
        const invoice  = event.data.object;
        const subId    = invoice.subscription as string;
        if (!subId || invoice.billing_reason !== "subscription_cycle") break;

        const user = await getUserByStripeSubscription(subId);
        if (!user) break;

        const plan = PLAN_DEFS[user.plan];
        if (!plan) break;

        // Reset credits for new billing period
        const sub = await stripeGet(`subscriptions/${subId}`);
        const expiresAt = new Date(sub.current_period_end * 1000).toISOString();

        await db.from("users").update({
          images_left:  plan.images,
          videos_left:  plan.videos,
          images_total: plan.images,
          videos_total: plan.videos,
          expires_at:   expiresAt,
        }).eq("id", user.id);
        break;
      }

      // ── Subscription cancelled / expired ─────────────────────────────
      case "customer.subscription.deleted": {
        const sub  = event.data.object;
        const user = await getUserByStripeSubscription(sub.id);
        if (!user) break;

        await db.from("users").update({
          plan:         "free",
          billing:      "monthly",
          images_left:  0,
          videos_left:  0,
          images_total: 0,
          videos_total: 0,
          expires_at:   null,
          stripe_subscription_id: null,
        }).eq("id", user.id);
        break;
      }

      // ── Payment failed ─────────────────────────────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subId   = invoice.subscription as string;
        if (!subId) break;
        // Don't downgrade immediately — Stripe retries. Just log.
        console.warn("[webhook] payment_failed for subscription:", subId);
        break;
      }
    }

    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error("[webhook] handler error:", err);
    res.status(500).json({ error: err.message });
  }
}