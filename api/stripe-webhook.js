import Stripe from "stripe";

const stripe = new Stripe(process.env.VITE_STRIPE_SECRET_KEY, { apiVersion: "2024-04-10" });

const PLAN_CREDITS = {
  "price_1TZjEpB7i0tTYaLUQq8ijMg1": { plan: "starter", generations: 100 },
  "price_1TZjFQB7i0tTYaLU4gE4wyKD": { plan: "pro",     generations: 400 },
};

async function supabasePatch(email, body) {
  const sUrl = (process.env.VITE_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL)?.replace(/\/+$/, "");
  const sKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${sUrl}/rest/v1/users?email=eq.${encodeURIComponent(email)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "apikey": sKey,
      "Authorization": `Bearer ${sKey}`,
      "Prefer": "return=minimal",
    },
    body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("[webhook] signature failed:", err.message);
    return res.status(400).json({ error: `Webhook signature error: ${err.message}` });
  }

  console.log("[webhook] event:", event.type);

  // ── Monthly renewal: reset credits to plan amount ─────────────────────────
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object;
    // Only process subscription renewals (not first payment — that's handled by activate-plan)
    if (invoice.billing_reason !== "subscription_cycle") return res.status(200).json({ ok: true });

    const priceId = invoice.lines?.data?.[0]?.price?.id;
    const planInfo = PLAN_CREDITS[priceId];
    if (!planInfo) return res.status(200).json({ ok: true });

    const customer = await stripe.customers.retrieve(invoice.customer);
    const email = customer.email?.toLowerCase().trim();
    if (!email) return res.status(200).json({ ok: true });

    console.log("[webhook] renewal:", email, "→ reset to", planInfo.generations, "gens");
    await supabasePatch(email, {
      plan:         planInfo.plan,
      images_left:  planInfo.generations, // reset to fresh monthly allowance
      images_total: planInfo.generations,
      billing:      "subscription",
    });
  }

  // ── Subscription cancelled: downgrade to free ─────────────────────────────
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    const customer = await stripe.customers.retrieve(sub.customer);
    const email = customer.email?.toLowerCase().trim();
    if (!email) return res.status(200).json({ ok: true });

    console.log("[webhook] cancelled:", email, "→ downgrade to free");
    await supabasePatch(email, {
      plan:         "free",
      images_left:  0,
      images_total: 0,
      billing:      "free",
    });
  }

  return res.status(200).json({ received: true });
}