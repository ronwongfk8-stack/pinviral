export default async function handler(req, res) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey  = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  const anonKey     = process.env.VITE_SUPABASE_ANON_KEY;
  const stripeKey   = process.env.VITE_STRIPE_SECRET_KEY;

  res.status(200).json({
    supabase_url:        supabaseUrl ? supabaseUrl.slice(0, 40) : "MISSING",
    service_key_prefix:  serviceKey  ? serviceKey.slice(0, 20)  : "MISSING",
    service_key_length:  serviceKey  ? serviceKey.length        : 0,
    anon_key_prefix:     anonKey     ? anonKey.slice(0, 20)     : "MISSING",
    stripe_key_prefix:   stripeKey   ? stripeKey.slice(0, 10)   : "MISSING",
    // Check if service key looks like anon key (same prefix = wrong key)
    service_equals_anon: serviceKey === anonKey,
  });
}