// api/activate-plan.js
//
// This endpoint USED TO grant plan credits directly from client-supplied
// email + priceId — which meant anyone could POST here with any email and
// any priceId and get free credits with no payment. That logic has been
// removed. Credits are now only ever granted by stripe-webhook.js, which
// verifies the payment actually happened via Stripe's signed webhook event.
//
// This endpoint is now just a read-only "has the webhook processed yet?"
// status check, so the frontend can poll it right after a Stripe redirect
// instead of trying to activate the plan itself. It's a thin wrapper around
// the same lookup get-user.js does.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "email is required" });

  const supabaseUrl = (
    process.env.VITE_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL
  )?.replace(/\/+$/, "");
  const serviceKey = (
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: "Server misconfiguration: missing Supabase env vars" });
  }

  const cleanEmail = email.toLowerCase().trim();

  try {
    const sbRes = await fetch(
      `${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(cleanEmail)}&select=plan,images_left,images_total`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      }
    );
    const rows = await sbRes.json();
    const user = Array.isArray(rows) ? rows[0] : null;

    if (!user) {
      // Webhook likely hasn't landed yet — frontend should keep polling.
      return res.status(200).json({ ready: false });
    }

    return res.status(200).json({
      ready: true,
      plan: user.plan,
      images_left: user.images_left,
      images_total: user.images_total,
    });
  } catch (err) {
    console.error("[activate-plan/status] error:", err.message);
    res.status(500).json({ error: err.message });
  }
}