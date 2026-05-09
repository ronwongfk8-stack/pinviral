/**
 * /api/setup-stripe.ts
 * GET  → { priceIds }         — fetch existing prices from Stripe metadata
 * POST → { priceIds, log[] }  — create any missing products/prices
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { runtime: "nodejs", maxDuration: 60 };

const SK = process.env.STRIPE_SECRET_KEY!;

async function stripePost(endpoint: string, params: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SK}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json() as any;
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`);
  return data;
}

async function stripeGet(endpoint: string) {
  const res = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    headers: { Authorization: `Bearer ${SK}` },
  });
  const data = await res.json() as any;
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`);
  return data;
}

const PLANS = [
  { key: "starter", name: "PinViral Starter", monthly: 2900,  annual: 24000  },
  { key: "pro",     name: "PinViral Pro",     monthly: 5900,  annual: 49200  },
  { key: "scale",   name: "PinViral Scale",   monthly: 11900, annual: 99600  },
  { key: "agency",  name: "PinViral Agency",  monthly: 19900, annual: 166800 },
];

const TOPUPS = [
  { key: "topup_50img",    name: "PinViral Top-up: 50 Images",              amount: 1200 },
  { key: "topup_10vid",    name: "PinViral Top-up: 10 Videos",              amount: 1900 },
  { key: "topup_bundle_s", name: "PinViral Top-up: 50 Images + 5 Videos",   amount: 2500 },
  { key: "topup_bundle_m", name: "PinViral Top-up: 100 Images + 15 Videos", amount: 4900 },
  { key: "topup_bundle_l", name: "PinViral Top-up: 250 Images + 40 Videos", amount: 9900 },
];

async function fetchExistingPriceIds(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  const data = await stripeGet("prices?active=true&limit=100");
  for (const price of data.data || []) {
    const key = price.metadata?.pinviral_key;
    if (key) ids[key] = price.id;
  }
  return ids;
}

async function ensureProduct(planKey: string, name: string): Promise<string> {
  // Search for existing product by metadata
  const data = await stripeGet(`products/search?query=metadata['pinviral_key']:'${planKey}'&limit=1`);
  if (data.data?.length > 0) return data.data[0].id;
  const product = await stripePost("products", {
    name,
    "metadata[pinviral_key]": planKey,
    "metadata[pinviral_managed]": "true",
  });
  return product.id;
}

async function ensurePrice(
  productId: string,
  priceKey: string,
  amount: number,
  interval: "month" | "year" | null,
): Promise<string> {
  const existing = await stripeGet(`prices?product=${productId}&active=true&limit=20`);
  const found = (existing.data || []).find((p: any) => p.metadata?.pinviral_key === priceKey);
  if (found) return found.id;

  const params: Record<string, string> = {
    product:                    productId,
    unit_amount:                String(amount),
    currency:                   "usd",
    "metadata[pinviral_key]":   priceKey,
    "metadata[pinviral_managed]": "true",
  };
  if (interval) {
    params["recurring[interval]"] = interval;
  }
  const price = await stripePost("prices", params);
  return price.id;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!SK) return res.status(500).json({ error: "STRIPE_SECRET_KEY not set" });

  // GET — return existing prices only
  if (req.method === "GET") {
    try {
      const priceIds = await fetchExistingPriceIds();
      return res.status(200).json({ priceIds, count: Object.keys(priceIds).length });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const log: string[] = [];
    const priceIds = await fetchExistingPriceIds();
    log.push(`Found ${Object.keys(priceIds).length} existing prices.`);

    // Subscription plans
    for (const plan of PLANS) {
      const mk = `${plan.key}_monthly`;
      const ak = `${plan.key}_annual`;
      if (priceIds[mk] && priceIds[ak]) {
        log.push(`✓ ${plan.name} — already exists`);
        continue;
      }
      log.push(`Creating ${plan.name}...`);
      const productId = await ensureProduct(plan.key, plan.name);
      if (!priceIds[mk]) {
        priceIds[mk] = await ensurePrice(productId, mk, plan.monthly, "month");
        log.push(`  ✅ ${mk}: ${priceIds[mk]}`);
      }
      if (!priceIds[ak]) {
        priceIds[ak] = await ensurePrice(productId, ak, plan.annual, "year");
        log.push(`  ✅ ${ak}: ${priceIds[ak]}`);
      }
    }

    // Top-up packs
    for (const topup of TOPUPS) {
      if (priceIds[topup.key]) {
        log.push(`✓ ${topup.name} — already exists`);
        continue;
      }
      log.push(`Creating ${topup.name}...`);
      const productId = await ensureProduct(topup.key, topup.name);
      priceIds[topup.key] = await ensurePrice(productId, topup.key, topup.amount, null);
      log.push(`  ✅ ${topup.key}: ${priceIds[topup.key]}`);
    }

    log.push(`Done — ${Object.keys(priceIds).length}/13 prices ready.`);
    return res.status(200).json({ priceIds, log, count: Object.keys(priceIds).length });

  } catch (err: any) {
    console.error("[/api/setup-stripe]", err);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}