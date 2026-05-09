/**
 * /api/setup-stripe.ts  — Admin-only: create or fetch all 13 Stripe price IDs
 *
 * GET   → { priceIds }         — fetch existing prices from Stripe metadata
 * POST  → { priceIds, log[] }  — create any missing products/prices, return all IDs
 *
 * Idempotent: if a price already exists (found via Stripe metadata tag), it is
 * reused rather than duplicated.
 */

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

// Tag used to identify PinViral prices so we never double-create
const TAG = "pinviral_managed";

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

  // List all active prices with our tag
  const prices = await stripe.prices.list({ active: true, limit: 100 });
  for (const price of prices.data) {
    const tag = price.metadata?.pinviral_key;
    if (tag) ids[tag] = price.id;
  }
  return ids;
}

async function ensureProduct(planKey: string, name: string): Promise<string> {
  // Check if product already exists
  const products = await stripe.products.search({
    query: `metadata['pinviral_key']:'${planKey}'`,
  });
  if (products.data.length > 0) return products.data[0].id;

  const product = await stripe.products.create({
    name,
    metadata: { pinviral_key: planKey, [TAG]: "true" },
  });
  return product.id;
}

async function ensurePrice(
  productId: string,
  priceKey: string,
  amount: number,
  interval: "month" | "year" | null, // null = one-time
): Promise<string> {
  // Check if price already tagged
  const existing = await stripe.prices.list({ product: productId, active: true, limit: 20 });
  const found = existing.data.find(p => p.metadata?.pinviral_key === priceKey);
  if (found) return found.id;

  const params: Stripe.PriceCreateParams = {
    product: productId,
    unit_amount: amount,
    currency: "usd",
    metadata: { pinviral_key: priceKey, [TAG]: "true" },
    ...(interval
      ? { recurring: { interval } }
      : {}),
  };
  const price = await stripe.prices.create(params);
  return price.id;
}

export default async function handler(req: Request): Promise<Response> {
  // Require admin secret to protect this endpoint in production
  const adminSecret = process.env.ADMIN_SECRET;
  if (adminSecret) {
    const auth = req.headers.get("x-admin-secret");
    if (auth !== adminSecret) {
      return json({ error: "Unauthorized" }, 401);
    }
  }

  try {
    // GET — return existing price IDs only
    if (req.method === "GET") {
      const priceIds = await fetchExistingPriceIds();
      return json({ priceIds, count: Object.keys(priceIds).length });
    }

    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    // POST — create missing prices
    const log: string[] = [];
    const priceIds = await fetchExistingPriceIds();
    log.push(`Found ${Object.keys(priceIds).length} existing prices.`);

    // Subscription plans (monthly + annual)
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

    // Top-up packs (one-time payments)
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
    return json({ priceIds, log, count: Object.keys(priceIds).length });

  } catch (err: any) {
    console.error("[/api/setup-stripe]", err);
    return json({ error: err.message || "Internal error" }, 500);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const config = { runtime: "edge" };