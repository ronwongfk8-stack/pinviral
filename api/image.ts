// api/image.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { geminiImage } from "../lib/gemini.js";

export const config = { runtime: "nodejs" };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { prompt, imageB64, imageMime, aspectRatio } = req.body as {
      prompt: string;
      imageB64?: string;
      imageMime?: string;
      aspectRatio?: string;
    };
    if (!prompt) return res.status(400).json({ error: "prompt is required" });
    const b64 = await geminiImage(prompt, imageB64, imageMime, aspectRatio);
    res.status(200).json({ imageB64: b64 });
  } catch (err: any) {
    const msg = err.message || "Image generation failed";
    res.status(msg.includes("quota") || msg.includes("429") ? 429 : 500).json({ error: msg });
  }
}