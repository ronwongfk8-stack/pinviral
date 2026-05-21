export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { email, priceId, deduct, images_left: directLeft } = req.body;

  // ── Deduct-only mode (called after each generation) ─────────────────────────
  if (deduct && email && typeof directLeft === "number") {
    const sUrl = (
      process.env.VITE_PUBLIC_SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      process.env.SUPABASE_URL
    )?.replace(/\/+$/, "");
    const sKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      await fetch(`${sUrl}/rest/v1/users?email=eq.${encodeURIComponent(email.toLowerCase().trim())}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": sKey,
          "Authorization": `Bearer ${sKey}`,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({ images_left: directLeft, updated_at: new Date().toISOString() }),
      });
    } catch (err) { console.error("[activate/deduct] error:", err.message); }
    return res.status(200).json({ ok: true });
  }

  // Support all env var name variants
  const supabaseUrl = (
    process.env.VITE_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL
  )?.replace(/\/+$/, "");

  const serviceKey = (
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log("[activate] email:", email, "priceId:", priceId);
  console.log("[activate] url:", supabaseUrl?.slice(0, 40));
  console.log("[activate] key length:", serviceKey?.length);

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: "Server misconfiguration: missing Supabase env vars" });
  }

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

  const headers = {
    "Content-Type":  "application/json",
    "apikey":        serviceKey,
    "Authorization": `Bearer ${serviceKey}`,
  };

  const cleanEmail = email.toLowerCase().trim();

  try {
    // ── Step 1: Check if user already exists ──────────────────────────────────
    const existingRes = await fetch(
      `${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(cleanEmail)}&select=images_left,images_total`,
      { headers }
    );
    const existing = await existingRes.json();
    const existingUser = Array.isArray(existing) ? existing[0] : null;

    // ── Step 2: Calculate new balances (ADD credits, don't reset) ─────────────
    const currentLeft  = existingUser?.images_left  ?? 0;
    const currentTotal = existingUser?.images_total ?? 0;
    const newLeft      = currentLeft  + plan.generations;
    const newTotal     = currentTotal + plan.generations;

    console.log("[activate] credits: existing left:", currentLeft, "+ new:", plan.generations, "= total left:", newLeft);

    const now = new Date().toISOString();
    let sbRes;

    if (existingUser) {
      // ── Step 3a: User exists — PATCH only the fields that change ─────────────
      // Using PATCH by email avoids any primary-key ambiguity.
      // We never touch images_left via a full replace — only additive PATCH.
      sbRes = await fetch(
        `${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(cleanEmail)}`,
        {
          method: "PATCH",
          headers: { ...headers, "Prefer": "return=minimal" },
          body: JSON.stringify({
            plan:         plan.plan,
            images_left:  newLeft,
            images_total: newTotal,
            billing:      "one-time",
            updated_at:   now,
          }),
        }
      );
    } else {
      // ── Step 3b: New user — INSERT ────────────────────────────────────────────
      sbRes = await fetch(`${supabaseUrl}/rest/v1/users`, {
        method: "POST",
        headers: { ...headers, "Prefer": "return=minimal" },
        body: JSON.stringify({
          email:              cleanEmail,
          plan:               plan.plan,
          images_left:        newLeft,
          images_total:       newTotal,
          videos_left:        0,
          videos_total:       0,
          billing:            "one-time",
          stripe_customer_id: cleanEmail,
          activated_at:       now,
          updated_at:         now,
        }),
      });
    }

    const text = await sbRes.text();
    console.log("[activate] supabase status:", sbRes.status, "body:", text);

    if (!sbRes.ok && sbRes.status !== 201) {
      return res.status(500).json({ error: `Supabase error ${sbRes.status}: ${text}` });
    }

    res.status(200).json({
      success:     true,
      email:       cleanEmail,
      plan:        plan.plan,
      generations: plan.generations,
      images_left: newLeft,
      images_total: newTotal,
    });

  } catch (err) {
    console.error("[activate] fetch error:", err.message);
    res.status(500).json({ error: err.message });
  }
}

// ── Internal: handle deduct-only requests ─────────────────────────────────────
// Called by frontend after each generation to keep Supabase in sync
// Body: { email, deduct, images_left }