const SK = process.env.VITE_STRIPE_SECRET_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { priceId, userId, email } = req.body;
    if (!priceId) return res.status(400).json({ error: "priceId is required" });

    const successUrl = `${req.headers.origin}/?payment=success&email=${encodeURIComponent(email || "")}&price_id=${encodeURIComponent(priceId)}`;
    const cancelUrl  = `${req.headers.origin}/?payment=cancelled`;

    const SUBSCRIPTION_PRICES = [
      "price_1TZjEpB7i0tTYaLUQq8ijMg1", // Starter $17/mo
      "price_1TZjFQB7i0tTYaLU4gE4wyKD", // Pro $37/mo
    ];
    const mode = SUBSCRIPTION_PRICES.includes(priceId) ? "subscription" : "payment";

    const params = new URLSearchParams();
    params.append("payment_method_types[]", "card");
    params.append("line_items[0][price]", priceId);
    params.append("line_items[0][quantity]", "1");
    params.append("mode", mode);
    params.append("success_url", successUrl);
    params.append("cancel_url", cancelUrl);
    params.append("metadata[userId]", userId || "anonymous");
    params.append("metadata[priceId]", priceId);
    params.append("metadata[email]", email || "");

    // Pre-fill email in Stripe checkout if provided
    if (email) {
      params.append("customer_email", email);
    }

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SK}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await stripeRes.json();
    if (!stripeRes.ok) throw new Error(data?.error?.message || "Stripe error");

    res.status(200).json({ sessionId: data.id, url: data.url });
  } catch (err) {
    console.error("[checkout]", err);
    res.status(500).json({ error: err.message });
  }
}