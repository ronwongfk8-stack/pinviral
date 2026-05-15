export default async function handler(req, res) {
  const { sessionId } = req.query;
  const sk = process.env.VITE_STRIPE_SECRET_KEY;
  console.log("[debug] sk prefix:", sk?.slice(0, 7));

  if (!sessionId) return res.status(400).json({ error: "sessionId required" });

  try {
    const stripeRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${sessionId}`,
      { headers: { Authorization: `Bearer ${sk}` } }
    );
    const session = await stripeRes.json();
    res.status(200).json({
      stripe_status: stripeRes.status,
      payment_status: session.payment_status,
      email: session.customer_details?.email,
      metadata: session.metadata,
      error: session.error,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}