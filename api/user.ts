// api/user.ts — get or create user, returns session data
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getOrCreateUser } from "../lib/db";

export const config = { runtime: "nodejs" };


export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { email } = req.body as { email?: string };
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email required" });
    }

    const user = await getOrCreateUser(email);

    res.status(200).json({
      id:          user.id,
      email:       user.email,
      plan:        user.plan,
      billing:     user.billing,
      imagesLeft:  user.images_left,
      videosLeft:  user.videos_left,
      imagesTotal: user.images_total,
      videosTotal: user.videos_total,
      expiresAt:   user.expires_at,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load user" });
  }
}