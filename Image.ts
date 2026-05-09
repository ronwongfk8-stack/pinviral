// api/image.ts — image generation, server-side
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { geminiImage } from "../lib/gemini";
import { db, deductImage } from "../lib/db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { prompt, imageB64, imageMime, userId } = req.body as {
      prompt: string;
      imageB64?: string;
      imageMime?: string;
      userId?: string;
    };

    if (!prompt) return res.status(400).json({ error: "prompt is required" });

    // Check and deduct credit if user identified
    if (userId) {
      const ok = await deductImage(userId);
      if (!ok) return res.status(402).json({ error: "No image credits remaining. Please upgrade." });
    }

    const b64 = await geminiImage(prompt, imageB64, imageMime);
    res.status(200).json({ imageB64: b64 });
  } catch (err: any) {
    const msg = err.message || "Image generation failed";
    const status = msg.includes("quota") || msg.includes("429") ? 429
                 : msg.includes("credits") ? 402
                 : 500;
    res.status(status).json({ error: msg });
  }
}