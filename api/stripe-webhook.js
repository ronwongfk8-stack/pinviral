import Stripe from "stripe";

const stripe = new Stripe(process.env.VITE_STRIPE_SECRET_KEY, { apiVersion: "2024-04-10" });

// price → what a FIRST-TIME purchase or top-up grants.
// (Kept identical to the old activate-plan.js PLAN_CONFIG so behavior for
// existing customers doesn't change — just where it's verified.)
const PLAN_CONFIG = {
  "price_1TZjEpB7i0tTYaLUQq8ijMg1": { plan: "starter", generations: 100, billing: "subscription" },
  "price_1TZjFQB7i0tTYaLU4gE4wyKD": { plan: "pro",     generations: 400, billing: "subscription" },
  "price_1TZjGBB7i0tTYaLUDtGZKvCr": { plan: "topup",   generations: 50,  billing: "topup" },
};

// price → what a MONTHLY RENEWAL resets credits to.
const RENEWAL_CREDITS = {
  "price_1TZjEpB7i0tTYaLUQq8ijMg1": { plan: "starter", generations: 100 },
  "price_1TZjFQB7i0tTYaLU4gE4wyKD": { plan: "pro",     generations: 400 },
};

function supabaseEnv() {
  const sUrl = (process.env.VITE_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL)?.replace(/\/+$/, "");
  const sKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { sUrl, sKey };
}

async function supabaseGet(email) {
  const { sUrl, sKey } = supabaseEnv();
  const res = await fetch(`${sUrl}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=images_left,images_total,plan`, {
    headers: { apikey: sKey, Authorization: `Bearer ${sKey}` },
  });
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}

async function supabasePatch(email, body) {
  const { sUrl, sKey } = supabaseEnv();
  return fetch(`${sUrl}/rest/v1/users?email=eq.${encodeURIComponent(email)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: sKey,
      Authorization: `Bearer ${sKey}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
  });
}

async function supabaseInsert(body) {
  const { sUrl, sKey } = supabaseEnv();
  return fetch(`${sUrl}/rest/v1/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: sKey,
      Authorization: `Bearer ${sKey}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
}

// Vercel needs the raw body for Stripe signature verification — disable the
// default JSON body parser for this route.
export const config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const sig = req.headers["stripe-signature"];
  // Checks both naming variants — your Vercel project has this stored as
  // VITE_STRIPE_WEBHOOK_SECRET (not the plain name), which is why this was
  // coming through as undefined before.
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || process.env.VITE_STRIPE_WEBHOOK_SECRET;
  const rawBody = await readRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("[webhook] signature failed:", err.message);
    return res.status(400).json({ error: `Webhook signature error: ${err.message}` });
  }

  console.log("[webhook] event:", event.type);

  // ── First-time purchase / top-up — THIS is the actual proof of payment ────
  // Stripe only sends this after the customer has successfully paid, and the
  // event is signature-verified above, so unlike the old client-triggered
  // /api/activate-plan call, this can't be spoofed by a direct API request.
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.payment_status !== "paid") return res.status(200).json({ ok: true });

    const priceId = session.metadata?.priceId;
    const email = (session.metadata?.email || session.customer_email || session.customer_details?.email || "").toLowerCase().trim();
    const plan = PLAN_CONFIG[priceId];

    if (!plan || !email) {
      console.warn("[webhook] checkout.session.completed missing plan/email", { priceId, email });
      return res.status(200).json({ ok: true });
    }

    const existingUser = await supabaseGet(email);
    const currentLeft  = existingUser?.images_left  ?? 0;
    const currentTotal = existingUser?.images_total ?? 0;
    const isTopup = plan.billing === "topup";

    const newLeft  = isTopup ? currentLeft + plan.generations : plan.generations + currentLeft;
    const newTotal = isTopup ? currentTotal + plan.generations : currentTotal + plan.generations;
    const newPlan  = isTopup ? (existingUser?.plan ?? "free") : plan.plan;

    console.log("[webhook] checkout complete:", email, "billing:", plan.billing, "→ left:", newLeft);

    if (existingUser) {
      await supabasePatch(email, {
        plan: newPlan,
        images_left: newLeft,
        images_total: newTotal,
        billing: plan.billing,
        stripe_customer_id: session.customer || undefined,
      });
    } else {
      await supabaseInsert({
        email,
        plan: plan.plan,
        images_left: newLeft,
        images_total: newTotal,
        videos_left: 0,
        videos_total: 0,
        billing: plan.billing,
        stripe_customer_id: session.customer || email,
        activated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }

  // ── Monthly renewal: reset credits to plan amount ─────────────────────────
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object;
    if (invoice.billing_reason !== "subscription_cycle") return res.status(200).json({ ok: true });

    const priceId = invoice.lines?.data?.[0]?.price?.id;
    const planInfo = RENEWAL_CREDITS[priceId];
    if (!planInfo) return res.status(200).json({ ok: true });

    const customer = await stripe.customers.retrieve(invoice.customer);
    const email = customer.email?.toLowerCase().trim();
    if (!email) return res.status(200).json({ ok: true });

    console.log("[webhook] renewal:", email, "→ reset to", planInfo.generations, "gens");
    await supabasePatch(email, {
      plan:         planInfo.plan,
      images_left:  planInfo.generations,
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