// lib/db.ts — shared Supabase admin client (server-side only)
//
// IMPORTANT: before deploying this file, run sql/credits_rpc.sql once in
// your Supabase SQL editor. It creates the `trial_claims` table and the
// `deduct_credit` / `refund_credit` Postgres functions this file calls.
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || "";

// Don't throw at module load — let each function handle missing config gracefully
export const db = url && key
  ? createClient(url, key, { auth: { persistSession: false } })
  : null as any;

export function requireDb() {
  if (!url || !key) throw new Error("Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel environment variables.");
  return db;
}

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

/**
 * Fetch a user by email, or create a new free-trial user.
 *
 * "1 email / 1 machine" free-trial enforcement: if this is a brand-new
 * email, we check whether the same browser fingerprint or IP has already
 * claimed a free trial under a DIFFERENT email. If so, the new signup gets
 * 0 free credits instead of 2 (they can still buy a plan/top-up normally).
 * This only affects free-trial signups — it never touches existing or
 * paying users. It's a soft signal (fingerprints/IPs can be spoofed with
 * effort), not a hard guarantee, but it stops casual repeat-signup abuse.
 */
export async function getOrCreateUser(email: string, fingerprint?: string, ip?: string) {
  const d = requireDb();
  const cleanEmail = email.toLowerCase().trim();

  const { data } = await d.from("users").select("*").eq("email", cleanEmail).single();
  if (data) return data;

  let alreadyClaimed = false;
  if (fingerprint || ip) {
    const orParts: string[] = [];
    if (fingerprint) orParts.push(`fingerprint.eq.${fingerprint}`);
    if (ip) orParts.push(`ip.eq.${ip}`);
    const { data: priorClaims } = await d
      .from("trial_claims")
      .select("email")
      .or(orParts.join(","))
      .neq("email", cleanEmail)
      .limit(1);
    alreadyClaimed = !!(priorClaims && priorClaims.length > 0);
  }

  const freeImages = alreadyClaimed ? 0 : PLAN_DEFS.free.images;

  const { data: newUser, error } = await d.from("users").insert({
    email: cleanEmail,
    plan: "free",
    images_left: freeImages,
    videos_left: 0,
    images_total: freeImages,
    videos_total: 0,
  }).select().single();
  if (error) throw new Error(`Failed to create user: ${error.message}`);

  // Log this claim regardless of outcome so future signups from this
  // device/IP are caught too, not just the second one.
  await d.from("trial_claims").insert({ email: cleanEmail, fingerprint, ip }).catch(() => {});

  return newUser;
}

export async function getUserByStripeCustomer(customerId: string) {
  const { data } = await requireDb().from("users").select("*").eq("stripe_customer_id", customerId).single();
  return data;
}

export async function getUserByStripeSubscription(subId: string) {
  const { data } = await requireDb().from("users").select("*").eq("stripe_subscription_id", subId).single();
  return data;
}

// ── Credit deduction ─────────────────────────────────────────────────────────
// Email-keyed (this app has no accounts/sessions — email is the identity).
// Goes through the `deduct_credit` Postgres RPC so concurrent requests can't
// both succeed off the same last credit. See sql/credits_rpc.sql.

export async function deductImageByEmail(email: string): Promise<boolean> {
  const d = requireDb();
  const { data, error } = await d.rpc("deduct_credit", {
    p_email: email.toLowerCase().trim(),
    p_field: "images_left",
  });
  if (error) { console.error("[deductImageByEmail]", error.message); return false; }
  return !!data;
}

export async function deductVideoByEmail(email: string): Promise<boolean> {
  const d = requireDb();
  const { data, error } = await d.rpc("deduct_credit", {
    p_email: email.toLowerCase().trim(),
    p_field: "videos_left",
  });
  if (error) { console.error("[deductVideoByEmail]", error.message); return false; }
  return !!data;
}

export async function refundImageByEmail(email: string): Promise<void> {
  const d = requireDb();
  await d.rpc("refund_credit", { p_email: email.toLowerCase().trim(), p_field: "images_left" }).catch(() => {});
}

export async function refundVideoByEmail(email: string): Promise<void> {
  const d = requireDb();
  await d.rpc("refund_credit", { p_email: email.toLowerCase().trim(), p_field: "videos_left" }).catch(() => {});
}