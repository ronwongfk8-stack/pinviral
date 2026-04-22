import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface DBUser {
  stripe_customer_id: string;
  email?: string;
  plan: string;
  billing: string;
  images_left: number;
  videos_left: number;
  images_total: number;
  videos_total: number;
  stripe_subscription_id?: string;
  activated_at?: string;
  expires_at?: string;
  topup_history: { date: string; label: string; amount: number }[];
  updated_at?: string;
}

export async function fetchUserByCustomerId(stripeCustomerId: string): Promise<DBUser | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("stripe_customer_id", stripeCustomerId)
    .single();
  if (error || !data) return null;
  return data as DBUser;
}

export async function upsertUser(user: DBUser): Promise<void> {
  await supabase.from("users").upsert(
    { ...user, updated_at: new Date().toISOString() },
    { onConflict: "stripe_customer_id" }
  );
}