import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

const PLAN_CONFIG = {
  price_1TXDjcB7i0tTYaLUodi6N2Zy: { plan: "starter", generations: 50 },
  price_1TXDk3B7i0tTYaLUBr36BDko: { plan: "pro",     generations: 200 },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });

  const sk = process.env.VITE_STRIPE_SECRET_KEY;
  // Sanitize sessionId — remove any whitespace or extra chars
  const cleanSessionId = sessionId.trim().replace(/[^a-zA-Z0-9_]/g, "");
  console.log("[activate] sk prefix:", sk?.slice(0, 7));
  console.log("[activate] sessionId raw:", JSON.stringify(sessionId));
  console.log("[activate] sessionId clean:", cleanSessionId);

  try {
    // Use fetch directly instead of Stripe SDK
    const stripeRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${cleanSessionId}`,
      {
        headers: {
          Authorization: `Bearer ${sk}`,
        },
      }
    );

    const session = await stripeRes.json();
    console.log("[activate] stripe status:", stripeRes.status);
    console.log("[activate] payment_status:", session.payment_status);
    console.log("[activate] email:", session.customer_details?.email);
    console.log("[activate] metadata:", JSON.stringify(session.metadata));

    if (!stripeRes.ok) {
      return res.status(400).json({ error: session.error?.message || "Stripe error" });
    }

    if (session.payment_status !== "paid") {
      return res.status(400).json({ error: "Payment not completed" });
    }

    const email   = session.customer_details?.email;
    const priceId = session.metadata?.priceId;
    const plan    = PLAN_CONFIG[priceId];

    if (!email || !plan) {
      console.error("[activate] Missing — email:", email, "priceId:", priceId);
      return res.status(400).json({ error: `Missing data — email:${email} priceId:${priceId}` });
    }

    const now = new Date().toISOString();
    const { error } = await supabase.from("users").upsert(
      {
        email,
        plan:               plan.plan,
        images_left:        plan.generations,
        images_total:       plan.generations,
        videos_left:        0,
        videos_total:       0,
        billing:            "one-time",
        stripe_customer_id: session.customer || email,
        activated_at:       now,
        updated_at:         now,
      },
      { onConflict: "email" }
    );

    if (error) {
      console.error("[activate] Supabase error:", error.message, error.details, error.hint);
      return res.status(500).json({ error: error.message });
    }

    console.log("[activate] SUCCESS:", plan.plan, "for", email);
    res.status(200).json({ success: true, email, plan: plan.plan, generations: plan.generations });

  } catch (err) {
    console.error("[activate] CATCH:", err.message);
    res.status(500).json({ error: err.message });
  }
}