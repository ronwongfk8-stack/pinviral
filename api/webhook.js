import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.VITE_STRIPE_SECRET_KEY);

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

const PLAN_CONFIG = {
  price_1TXDjcB7i0tTYaLUodi6N2Zy: { plan: "starter", generations: 50 },
  price_1TXDk3B7i0tTYaLUBr36BDko: { plan: "pro",     generations: 200 },
};

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end",  () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const sig     = req.headers["stripe-signature"];
  const secret  = process.env.VITE_STRIPE_WEBHOOK_SECRET;
  const rawBody = await getRawBody(req);

  let event;
  try {
    if (secret && sig) {
      event = stripe.webhooks.constructEvent(rawBody, sig, secret);
    } else {
      event = JSON.parse(rawBody.toString());
      console.warn("[webhook] No webhook secret — skipping signature check");
    }
  } catch (err) {
    console.error("[webhook] Signature error:", err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  console.log("[webhook] Event received:", event.type);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email   = session.customer_details?.email;
    const priceId = session.metadata?.priceId;

    console.log("[webhook] email:", email, "priceId:", priceId);

    const plan = PLAN_CONFIG[priceId];

    if (!email) {
      console.error("[webhook] No email in session");
      return res.status(200).json({ received: true });
    }

    if (!plan) {
      console.error("[webhook] Unknown priceId:", priceId);
      return res.status(200).json({ received: true });
    }

    const now = new Date().toISOString();
    const { error } = await supabase.from("users").upsert(
      {
        email,
        plan:               plan.plan,
        images_left:        plan.generations,
        images_total:       plan.generations,
        videos_left:        0,
        videos_total:       0,
        billing:            "one-time",
        stripe_customer_id: session.customer || email,
        activated_at:       now,
        topup_history:      [],
        updated_at:         now,
      },
      { onConflict: "email" }
    );

    if (error) {
      console.error("[webhook] Supabase error:", error.message, error.details);
      return res.status(500).json({ error: error.message });
    }

    console.log("[webhook] Activated", plan.plan, "for", email);
  }

  res.status(200).json({ received: true });
}