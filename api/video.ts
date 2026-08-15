// api/video.ts — video generation via Veo 3, server-side
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { deductVideoByEmail, refundVideoByEmail } from "../lib/db.js";

export const config = { runtime: "nodejs" };

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.VITE_API_KEY || process.env.API_KEY || "";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const VEO_MODELS = [
  "veo-3.0-generate-001",
  "veo-2.0-generate-001",
  "veo-3.0-fast-generate-001",
];

const BASE_MOTION = "Create subtle, realistic motion: slight camera zoom (Ken Burns effect), soft lighting movement, gentle shadow shift, no distortion of the product, keep product shape 100% accurate, simulate real product photography video.";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!GEMINI_KEY) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

  try {
    const { imageB64, imageMime, prompt, email } = req.body as {
      imageB64: string;
      imageMime: string;
      prompt?: string;
      email?: string;
    };

    if (!imageB64 || !imageMime) {
      return res.status(400).json({ error: "imageB64 and imageMime are required" });
    }
    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "email is required" });
    }

    // Deduct BEFORE generating — no free ride if this is skipped or spoofed,
    // since it's now required and checked atomically server-side.
    const ok = await deductVideoByEmail(email);
    if (!ok) return res.status(402).json({ error: "No video credits remaining. Please upgrade." });

    const finalPrompt = `${BASE_MOTION} ${prompt || "Animate this Pinterest pin image. Smooth, aesthetic motion, lifestyle feel."}`;

    let lastErr: string = "";
    let succeeded = false;
    try {
      for (const model of VEO_MODELS) {
        try {
          const startRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateVideos?key=${GEMINI_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt: finalPrompt,
                image: { imageBytes: imageB64, mimeType: imageMime },
                config: { numberOfVideos: 1, aspectRatio: "9:16" },
              }),
            }
          );

          if (!startRes.ok) {
            const err = await startRes.json().catch(() => ({}));
            lastErr = err?.error?.message || `HTTP ${startRes.status}`;
            if (startRes.status === 429) throw new Error("Quota exceeded");
            continue;
          }

          const operation = await startRes.json();
          const opName = operation.name;
          if (!opName) { lastErr = "No operation name returned"; continue; }

          let op: any = operation;
          let polls = 0;
          while (!op.done && polls < 60) {
            await sleep(10000);
            const pollRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/${opName}?key=${GEMINI_KEY}`,
              { headers: { "Content-Type": "application/json" } }
            );
            if (pollRes.ok) op = await pollRes.json();
            polls++;
          }

          if (op.error) { lastErr = op.error.message || "Video generation failed"; continue; }
          if (!op.done)  { lastErr = "Video generation timed out"; continue; }

          const videoUri = op.response?.generatedVideos?.[0]?.video?.uri;
          if (!videoUri) { lastErr = "No video URI in response"; continue; }

          const vidRes = await fetch(videoUri, { headers: { "x-goog-api-key": GEMINI_KEY } });
          if (!vidRes.ok) { lastErr = `Failed to download video: ${vidRes.status}`; continue; }

          const buffer = await vidRes.arrayBuffer();
          const videoB64 = Buffer.from(buffer).toString("base64");
          const mimeType = vidRes.headers.get("content-type") || "video/mp4";

          succeeded = true;
          return res.status(200).json({ videoB64, mimeType });
        } catch (e: any) {
          if (e.message?.includes("Quota exceeded")) {
            lastErr = "Quota exceeded. Please wait and try again.";
            throw e;
          }
          lastErr = e.message || "Unknown error";
          continue;
        }
      }
    } finally {
      // Every path out of the loop that isn't a clean "return 200" means the
      // user didn't get a video — refund the credit we deducted up front.
      if (!succeeded) await refundVideoByEmail(email);
    }

    if (lastErr === "Quota exceeded. Please wait and try again.") {
      return res.status(429).json({ error: lastErr });
    }
    res.status(500).json({ error: lastErr || "All video models failed. Please try again." });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Video generation failed" });
  }
}