const SK = process.env.STRIPE_SECRET_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { priceId, userId } = req.body;
    if (!priceId) return res.status(400).json({ error: "priceId is required" });

    const params = new URLSearchParams({
      "payment_method_types[]": "card",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      mode: "payment",
      success_url: `${req.headers.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/pricing`,
      "metadata[userId]": userId || "anonymous",
      "metadata[priceId]": priceId,
    });

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