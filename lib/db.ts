// lib/db.ts — shared Supabase admin client (server-side only)
import { createClient } from "@supabase/supabase-js";

const url  = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL)!;
const key  = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY)!; // service role — never expose to browser

if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");

export const db = createClient(url, key, {
  auth: { persistSession: false },
});

// ── Plan definitions ────────────────────────────────────────────────────────
export const PLAN_DEFS: Record<string, { images: number; videos: number }> = {
  free:    { images: 2,    videos: 0   },
  starter: { images: 50,   videos: 3   },
  pro:     { images: 150,  videos: 15  },
  scale:   { images: 400,  videos: 50  },
  agency:  { images: 1200, videos: 150 },
};

export const TOPUP_PACKS: Record<string, { images: number; videos: number; price: number; label: string }> = {
  topup_50img:    { images: 50,  videos: 0,  price: 1200, label: "50 Images" },
  topup_10vid:    { images: 0,   videos: 10, price: 1900, label: "10 Videos" },
  topup_bundle_s: { images: 50,  videos: 5,  price: 2500, label: "50 Images + 5 Videos" },
  topup_bundle_m: { images: 100, videos: 15, price: 4900, label: "100 Images + 15 Videos" },
  topup_bundle_l: { images: 250, videos: 40, price: 9900, label: "250 Images + 40 Videos" },
};

// ── User helpers ────────────────────────────────────────────────────────────
export async function getOrCreateUser(email: string) {
  const { data, error } = await db
    .from("users")
    .select("*")
    .eq("email", email.toLowerCase().trim())
    .single();

  if (data) return data;

  // Create new free-plan user
  const { data: newUser, error: createErr } = await db
    .from("users")
    .insert({
      email: email.toLowerCase().trim(),
      plan: "free",
      images_left: 2,
      videos_left: 0,
      images_total: 2,
      videos_total: 0,
    })
    .select()
    .single();

  if (createErr) throw new Error(`Failed to create user: ${createErr.message}`);
  return newUser;
}

export async function getUserByEmail(email: string) {
  const { data } = await db
    .from("users")
    .select("*")
    .eq("email", email.toLowerCase().trim())
    .single();
  return data;
}

export async function getUserByStripeCustomer(customerId: string) {
  const { data } = await db
    .from("users")
    .select("*")
    .eq("stripe_customer_id", customerId)
    .single();
  return data;
}

export async function getUserByStripeSubscription(subId: string) {
  const { data } = await db
    .from("users")
    .select("*")
    .eq("stripe_subscription_id", subId)
    .single();
  return data;
}

export async function deductImage(userId: string): Promise<boolean> {
  const { data: user } = await db.from("users").select("images_left").eq("id", userId).single();
  if (!user || user.images_left <= 0) return false;
  await db.from("users").update({ images_left: user.images_left - 1 }).eq("id", userId);
  await db.from("generation_log").insert({ user_id: userId, type: "image" });
  return true;
}

export async function deductVideo(userId: string): Promise<boolean> {
  const { data: user } = await db.from("users").select("videos_left").eq("id", userId).single();
  if (!user || user.videos_left <= 0) return false;
  await db.from("users").update({ videos_left: user.videos_left - 1 }).eq("id", userId);
  await db.from("generation_log").insert({ user_id: userId, type: "video" });
  return true;
}