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

  const { email, priceId } = req.body;

  console.log("[activate] email:", email, "priceId:", priceId);
  console.log("[activate] supabase url:", process.env.VITE_SUPABASE_URL?.slice(0, 30));
  console.log("[activate] service key exists:", !!process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

  if (!email || !priceId) {
    return res.status(400).json({ error: `Missing — email:${email} priceId:${priceId}` });
  }

  const plan = PLAN_CONFIG[priceId];
  if (!plan) {
    return res.status(400).json({ error: `Unknown priceId: ${priceId}` });
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase.from("users").upsert(
    {
      email: email.toLowerCase().trim(),
      plan: plan.plan,
      images_left: plan.generations,
      images_total: plan.generations,
      videos_left: 0,
      videos_total: 0,
      billing: "one-time",
      stripe_customer_id: email,
      activated_at: now,
      updated_at: now,
    },
    { onConflict: "email" }
  ).select();

  if (error) {
    console.error("[activate] Supabase error:", JSON.stringify(error));
    return res.status(500).json({ error: error.message, details: error.details, hint: error.hint });
  }

  console.log("[activate] SUCCESS:", plan.plan, "for", email, "data:", JSON.stringify(data));
  res.status(200).json({ success: true, email, plan: plan.plan, generations: plan.generations });
}