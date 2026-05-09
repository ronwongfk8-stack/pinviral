// api/setup-stripe.ts — one-time admin route to create all Stripe products & prices
// Only runs if STRIPE_SECRET_KEY is set on the server
// Call once from the Stripe setup panel — never called by end users

import type { VercelRequest, VercelResponse } from "@vercel/node";

const STRIPE_SK = process.env.STRIPE_SECRET_KEY || "";

async function stripePost(endpoint: string, params: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SK}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`);
  return data;
}

const PLANS = [
  { key: "starter", name: "PinViral Starter", monthly: 2900,  annual: 24000  },
  { key: "pro",     name: "PinViral Pro",     monthly: 5900,  annual: 49200  },
  { key: "scale",   name: "PinViral Scale",   monthly: 9900,  annual: 82800  },
  { key: "agency",  name: "PinViral Agency",  monthly: 19900, annual: 166800 },
];

const TOPUPS = [
  { key: "topup_50img",    name: "50 Images",                amount: 1200 },
  { key: "topup_10vid",    name: "10 Videos",                amount: 1900 },
  { key: "topup_bundle_s", name: "50 Images + 5 Videos",     amount: 2500 },
  { key: "topup_bundle_m", name: "100 Images + 15 Videos",   amount: 4900 },
  { key: "topup_bundle_l", name: "250 Images + 40 Videos",   amount: 9900 },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!STRIPE_SK) return res.status(500).json({ error: "STRIPE_SECRET_KEY not set on server" });

  // Basic protection — only allow from localhost or with admin header
  const host   = req.headers.host || "";
  const isLocal = host.includes("localhost") || host.includes("127.0.0.1");
  const adminKey = req.headers["x-admin-key"];
  const serverAdminKey = process.env.ADMIN_SECRET || "";

  if (!isLocal && serverAdminKey && adminKey !== serverAdminKey) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const priceIds: Record<string, string> = {};
    const log: string[] = [];

    // Create subscription plans
    for (const plan of PLANS) {
      const mk = `${plan.key}_monthly`;
      const ak = `${plan.key}_annual`;

      const prod = await stripePost("products", {
        name: plan.name,
        "metadata[plan]": plan.key,
      });
      log.push(`Product: ${prod.name} (${prod.id})`);

      const monthly = await stripePost("prices", {
        product: prod.id,
        unit_amount: String(plan.monthly),
        currency: "usd",
        "recurring[interval]": "month",
        "metadata[plan]": plan.key,
        "metadata[billing]": "monthly",
      });
      priceIds[mk] = monthly.id;
      log.push(`  Monthly: ${monthly.id}`);

      const annual = await stripePost("prices", {
        product: prod.id,
        unit_amount: String(plan.annual),
        currency: "usd",
        "recurring[interval]": "year",
        "metadata[plan]": plan.key,
        "metadata[billing]": "annual",
      });
      priceIds[ak] = annual.id;
      log.push(`  Annual: ${annual.id}`);
    }

    // Create top-up one-time prices
    for (const topup of TOPUPS) {
      const prod = await stripePost("products", {
        name: topup.name,
        "metadata[type]": "topup",
        "metadata[topup_key]": topup.key,
      });
      const price = await stripePost("prices", {
        product: prod.id,
        unit_amount: String(topup.amount),
        currency: "usd",
        "metadata[topup_key]": topup.key,
      });
      priceIds[topup.key] = price.id;
      log.push(`Topup ${topup.name}: ${price.id}`);
    }

    res.status(200).json({ priceIds, log });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Setup failed" });
  }
}