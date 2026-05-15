const Stripe = require("stripe");
const stripe = new Stripe(process.env.VITE_STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    res.status(200).json({
      payment_status: session.payment_status,
      email: session.customer_details?.email,
      metadata: session.metadata,
      customer: session.customer,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};