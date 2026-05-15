import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

const STRIPE_WEBHOOK_SECRET = process.env.VITE_STRIPE_WEBHOOK_SECRET;

// Plan config — must match App.tsx PRICE_IDS
const PLAN_CONFIG = {
  price_1TXDjcB7i0tTYaLUodi6N2Zy: { plan: "starter", generations: 50 },
  price_1TXDk3B7i0tTYaLUBr36BDko: { plan: "pro",     generations: 200 },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const sig  = req.headers["stripe-signature"];
  const body = req.body; // raw body needed — see note below

  let event;

  // Verify webhook signature if secret is set
  if (STRIPE_WEBHOOK_SECRET && sig) {
    try {
      const crypto = await import("crypto");
      const rawBody = typeof body === "string" ? body : JSON.stringify(body);
      const [, timestamp] = sig.split(",").find(p => p.startsWith("t=")).split("=");
      const payload = `${timestamp}.${rawBody}`;
      const expected = crypto
        .createHmac("sha256", STRIPE_WEBHOOK_SECRET)
        .update(payload)
        .digest("hex");
      const received = sig.split(",").find(p => p.startsWith("v1="))?.split("=")[1];
      if (expected !== received) {
        console.error("[webhook] Signature mismatch");
        return res.status(400).json({ error: "Invalid signature" });
      }
      event = JSON.parse(rawBody);
    } catch (err) {
      console.error("[webhook] Sig error:", err.message);
      return res.status(400).json({ error: err.message });
    }
  } else {
    // No signature check in dev
    event = typeof body === "string" ? JSON.parse(body) : body;
  }

  if (event.type === "checkout.session.completed") {
    const session  = event.data.object;
    const email    = session.customer_details?.email;
    const priceId  = session.metadata?.priceId;
    const plan     = PLAN_CONFIG[priceId];

    if (!email || !plan) {
      console.warn("[webhook] Missing email or unknown priceId:", priceId);
      return res.status(200).json({ received: true });
    }

    const now = new Date().toISOString();

    // Upsert user record in Supabase
    const { error } = await supabase.from("users").upsert(
      {
        email,
        plan:            plan.plan,
        images_left:     plan.generations,
        images_total:    plan.generations,
        videos_left:     0,
        videos_total:    0,
        billing:         "one-time",
        stripe_customer_id: session.customer || email,
        activated_at:    now,
        topup_history:   [],
        updated_at:      now,
      },
      { onConflict: "email" }
    );

    if (error) {
      console.error("[webhook] Supabase upsert error:", error.message);
      return res.status(500).json({ error: error.message });
    }

    console.log(`[webhook] ✅ Activated ${plan.plan} for ${email}`);
  }

  res.status(200).json({ received: true });
}