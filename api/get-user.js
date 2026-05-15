import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "email is required" });

  console.log("[get-user] looking up:", email);
  console.log("[get-user] supabase url:", process.env.VITE_SUPABASE_URL?.slice(0,20));

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email.toLowerCase().trim())
    .single();

  if (error || !data) {
    console.log("[get-user] not found:", error?.message);
    return res.status(404).json({ error: "User not found" });
  }

  console.log("[get-user] found:", data.email, "plan:", data.plan);
  res.status(200).json({ user: data });
}