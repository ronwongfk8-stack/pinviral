import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.VITE_STRIPE_SECRET_KEY);
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

  try {
    // Fetch session directly from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    console.log("[activate] payment_status:", session.payment_status);

    if (session.payment_status !== "paid") {
      return res.status(400).json({ error: "Payment not completed" });
    }

    const email   = session.customer_details?.email;
    const priceId = session.metadata?.priceId;
    const plan    = PLAN_CONFIG[priceId];

    console.log("[activate] email:", email, "priceId:", priceId, "plan:", plan?.plan);

    if (!email || !plan) {
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
        topup_history:      [],
        updated_at:         now,
      },
      { onConflict: "email" }
    );

    if (error) {
      console.error("[activate] Supabase error:", error.message);
      return res.status(500).json({ error: error.message });
    }

    console.log("[activate] ✅ Activated", plan.plan, "for", email);
    res.status(200).json({ success: true, email, plan: plan.plan, generations: plan.generations });

  } catch (err) {
    console.error("[activate] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
}