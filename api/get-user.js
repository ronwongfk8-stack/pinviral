export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "email is required" });

  const supabaseUrl = (process.env.VITE_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL)?.replace(/\/+$/, "");
  const serviceKey  = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cleanEmail  = decodeURIComponent(email).toLowerCase().trim();

  if (!supabaseUrl || !serviceKey) {
    console.error("[get-user] Missing env: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    return res.status(500).json({ error: "Server misconfiguration: missing Supabase env vars" });
  }

  try {
    // select= is explicit now — only the fields the frontend actually needs
    // are returned. Previously select=* leaked stripe_customer_id and other
    // internal fields to anyone who could guess/find an email.
    const sbRes = await fetch(
      `${supabaseUrl}/rest/v1/users?email=eq.${encodeURIComponent(cleanEmail)}&select=email,plan,billing,images_left,images_total,videos_left,videos_total`,
      {
        headers: {
          "apikey":        serviceKey,
          "Authorization": `Bearer ${serviceKey}`,
        },
      }
    );

    const data = await sbRes.json();

    if (!sbRes.ok || !data || data.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({ user: data[0] });
  } catch (err) {
    console.error("[get-user] error:", err.message);
    res.status(500).json({ error: err.message });
  }
}