import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY || process.env.VITE_STRIPE_SECRET_KEY
);

const supabase = createClient(
  process.env.VITE_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PLAN_CONFIG = {
  price_1TXDjcB7i0tTYaLUodi6N2Zy: { plan: "starter", generations: 50 },
  price_1TXDk3B7i0tTYaLUBr36BDko: { plan: "pro",     generations: 200 },
};

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end",  () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const sig     = req.headers["stripe-signature"];
  const secret  = process.env.STRIPE_WEBHOOK_SECRET || process.env.VITE_STRIPE_WEBHOOK_SECRET;
  const rawBody = await getRawBody(req);

  let event;
  try {
    if (secret && sig) {
      event = stripe.webhooks.constructEvent(rawBody, sig, secret);
    } else {
      event = JSON.parse(rawBody.toString());
      console.warn("[webhook] No webhook secret — skipping signature check");
    }
  } catch (err) {
    console.error("[webhook] Signature error:", err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  console.log("[webhook] Event received:", event.type);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email   = session.customer_details?.email;

    // priceId may be in metadata OR retrieved from line_items
    let priceId = session.metadata?.priceId;
    if (!priceId && session.id) {
      try {
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
        priceId = lineItems.data[0]?.price?.id;
        console.log("[webhook] priceId from line_items:", priceId);
      } catch (e) {
        console.error("[webhook] Could not fetch line items:", e.message);
      }
    }

    console.log("[webhook] email:", email, "priceId:", priceId);

    if (!email) {
      console.error("[webhook] No email in session");
      return res.status(200).json({ received: true });
    }

    const plan = PLAN_CONFIG[priceId];
    if (!plan) {
      console.error("[webhook] Unknown priceId:", priceId);
      return res.status(200).json({ received: true });
    }

    const cleanEmail = email.toLowerCase().trim();
    const now = new Date().toISOString();

    // Fetch existing user so we ADD credits rather than reset
    const { data: existing } = await supabase
      .from("users")
      .select("images_left, images_total, topup_history")
      .eq("email", cleanEmail)
      .maybeSingle();

    const currentLeft  = existing?.images_left  ?? 0;
    const currentTotal = existing?.images_total ?? 0;
    const newLeft      = currentLeft  + plan.generations;
    const newTotal     = currentTotal + plan.generations;

    const topupHistory = [
      ...(existing?.topup_history || []),
      { date: now, plan: plan.plan, credits: plan.generations },
    ];

    const { error } = await supabase.from("users").upsert(
      {
        email:              cleanEmail,
        plan:               plan.plan,
        images_left:        newLeft,
        images_total:       newTotal,
        videos_left:        0,
        videos_total:       0,
        billing:            "one-time",
        stripe_customer_id: session.customer || cleanEmail,
        activated_at:       now,
        topup_history:      topupHistory,
        updated_at:         now,
      },
      { onConflict: "email" }
    );

    if (error) {
      console.error("[webhook] Supabase error:", error.message, error.details);
      return res.status(500).json({ error: error.message });
    }

    console.log("[webhook] Activated", plan.plan, "for", cleanEmail,
      "| added:", plan.generations, "| total left:", newLeft);
  }

  res.status(200).json({ received: true });
}