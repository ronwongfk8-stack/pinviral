// api/image.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { geminiImage } from "../lib/gemini.js";
import { getOrCreateUser, deductImageByEmail, refundImageByEmail } from "../lib/db.js";

export const config = { runtime: "nodejs" };

function getClientIp(req: VercelRequest): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  if (Array.isArray(fwd)) return fwd[0];
  return (req.socket as any)?.remoteAddress || "";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { prompt, imageB64, imageMime, aspectRatio, email, fingerprint } = req.body as {
      prompt: string;
      imageB64?: string;
      imageMime?: string;
      aspectRatio?: string;
      email?: string;
      fingerprint?: string;
    };
    if (!prompt) return res.status(400).json({ error: "prompt is required" });
    if (!email || !email.includes("@")) return res.status(400).json({ error: "email is required" });

    const ip = getClientIp(req);
    const user = await getOrCreateUser(email, fingerprint, ip);

    if (user.images_left <= 0) {
      return res.status(402).json({ error: "No image credits remaining. Please upgrade or top up.", images_left: 0 });
    }

    // Deduct BEFORE generating (atomically, via RPC) so two concurrent
    // requests can't both spend the same last credit.
    const deducted = await deductImageByEmail(email);
    if (!deducted) {
      return res.status(402).json({ error: "No image credits remaining. Please upgrade or top up.", images_left: 0 });
    }

    try {
      const b64 = await geminiImage(prompt, imageB64, imageMime, aspectRatio);
      return res.status(200).json({ imageB64: b64 });
    } catch (genErr) {
      // Generation failed after we already charged for it — give the credit back.
      await refundImageByEmail(email);
      throw genErr;
    }
  } catch (err: any) {
    const msg = err.message || "Image generation failed";
    res.status(msg.includes("quota") || msg.includes("429") ? 429 : 500).json({ error: msg });
  }
}