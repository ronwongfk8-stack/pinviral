export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { email, priceId } = req.body;

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey  = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

  console.log("[activate] email:", email, "priceId:", priceId);
  console.log("[activate] url:", supabaseUrl?.slice(0, 40));
  console.log("[activate] key length:", serviceKey?.length);

  const PLAN_CONFIG = {
    "price_1TXDjcB7i0tTYaLUodi6N2Zy": { plan: "starter", generations: 50 },
    "price_1TXDk3B7i0tTYaLUBr36BDko": { plan: "pro",     generations: 200 },
  };

  if (!email || !priceId) {
    return res.status(400).json({ error: `Missing — email:${email} priceId:${priceId}` });
  }

  const plan = PLAN_CONFIG[priceId];
  if (!plan) {
    return res.status(400).json({ error: `Unknown priceId: ${priceId}` });
  }

  const now = new Date().toISOString();
  const body = JSON.stringify({
    email:              email.toLowerCase().trim(),
    plan:               plan.plan,
    images_left:        plan.generations,
    images_total:       plan.generations,
    videos_left:        0,
    videos_total:       0,
    billing:            "one-time",
    stripe_customer_id: email.toLowerCase().trim(),
    activated_at:       now,
    updated_at:         now,
  });

  console.log("[activate] posting to supabase:", `${supabaseUrl}/rest/v1/users`);

  try {
    const sbRes = await fetch(`${supabaseUrl}/rest/v1/users`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "apikey":        serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
        "Prefer":        "resolution=merge-duplicates",
      },
      body,
    });

    const text = await sbRes.text();
    console.log("[activate] supabase status:", sbRes.status, "body:", text);

    if (!sbRes.ok && sbRes.status !== 201) {
      return res.status(500).json({ error: `Supabase error ${sbRes.status}: ${text}` });
    }

    res.status(200).json({ success: true, email, plan: plan.plan, generations: plan.generations });

  } catch (err) {
    console.error("[activate] fetch error:", err.message);
    res.status(500).json({ error: err.message });
  }
}