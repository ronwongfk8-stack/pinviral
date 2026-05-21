const SK = process.env.VITE_STRIPE_SECRET_KEY;

async function stripeGet(path) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${SK}`, "Stripe-Version": "2024-04-10" },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`);
  return data;
}

async function stripePost(path, params) {
  const body = new URLSearchParams(params).toString();
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SK}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2024-04-10",
    },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe ${res.status}`);
  return data;
}

const PLANS = [
  { key: "starter", name: "PinViral Starter — 75 Generations", amount: 1900 },
  { key: "pro",     name: "PinViral Pro — 250 Generations",    amount: 3900 },
];

async function fetchExistingPriceIds() {
  const ids = {};
  const data = await stripeGet("prices?active=true&limit=100");
  for (const price of data.data || []) {
    const tag = price.metadata?.pinviral_key;
    if (tag) ids[tag] = price.id;
  }
  return ids;
}

async function ensureProduct(planKey, name) {
  const data = await stripeGet(`products/search?query=metadata['pinviral_key']:'${planKey}'&limit=1`);
  if (data.data?.length > 0) return data.data[0].id;
  const prod = await stripePost("products", {
    name,
    "metadata[pinviral_key]": planKey,
    "metadata[pinviral_managed]": "true",
  });
  return prod.id;
}

async function ensurePrice(productId, priceKey, amount) {
  const existing = await stripeGet(`prices?product=${productId}&active=true&limit=20`);
  const found = (existing.data || []).find((p) => p.metadata?.pinviral_key === priceKey);
  if (found) return found.id;
  const params = {
    product: productId,
    unit_amount: String(amount),
    currency: "usd",
    "metadata[pinviral_key]": priceKey,
    "metadata[pinviral_managed]": "true",
  };
  const price = await stripePost("prices", params);
  return price.id;
}

export default async function handler(req, res) {
  if (!SK) return res.status(500).json({ error: "VITE_STRIPE_SECRET_KEY not set" });

  try {
    if (req.method === "GET") {
      const priceIds = await fetchExistingPriceIds();
      return res.status(200).json({ priceIds, count: Object.keys(priceIds).length });
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const log = [];
    const priceIds = await fetchExistingPriceIds();
    log.push(`Found ${Object.keys(priceIds).length} existing prices.`);

    for (const plan of PLANS) {
      if (priceIds[plan.key]) {
        log.push(`✓ ${plan.name} — exists`);
        continue;
      }
      const productId = await ensureProduct(plan.key, plan.name);
      priceIds[plan.key] = await ensurePrice(productId, plan.key, plan.amount);
      log.push(`✅ ${plan.key}: ${priceIds[plan.key]}`);
    }

    log.push(`Done — ${Object.keys(priceIds).length}/${PLANS.length} prices ready.`);
    return res.status(200).json({ priceIds, log, count: Object.keys(priceIds).length });

  } catch (err) {
    console.error("[/api/setup-stripe]", err);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}