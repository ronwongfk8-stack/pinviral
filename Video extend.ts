// api/video-extend.ts — extend existing video via Veo, server-side
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { deductVideo } from "../lib/db";

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || "";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const VEO_MODELS = ["veo-3.0-generate-001", "veo-2.0-generate-001", "veo-3.0-fast-generate-001"];
const BASE_MOTION = "Continue the cinematic motion smoothly. Keep the product in focus and maintain the realistic lighting.";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!GEMINI_KEY) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

  try {
    const { videoB64, videoMime, prompt, userId } = req.body as {
      videoB64: string;
      videoMime: string;
      prompt?: string;
      userId?: string;
    };

    if (!videoB64 || !videoMime) {
      return res.status(400).json({ error: "videoB64 and videoMime are required" });
    }

    if (userId) {
      const ok = await deductVideo(userId);
      if (!ok) return res.status(402).json({ error: "No video credits remaining. Please upgrade." });
    }

    const finalPrompt = `${BASE_MOTION} ${prompt || ""}`.trim();

    let lastErr = "";
    for (const model of VEO_MODELS) {
      try {
        const startRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateVideos?key=${GEMINI_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: finalPrompt,
              video: { videoBytes: videoB64, mimeType: videoMime },
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
        if (!opName) { lastErr = "No operation name"; continue; }

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

        if (op.error) { lastErr = op.error.message; continue; }
        if (!op.done) { lastErr = "Timed out"; continue; }

        const videoUri = op.response?.generatedVideos?.[0]?.video?.uri;
        if (!videoUri) { lastErr = "No video URI"; continue; }

        const vidRes = await fetch(videoUri, {
          headers: { "x-goog-api-key": GEMINI_KEY },
        });
        if (!vidRes.ok) { lastErr = `Download failed: ${vidRes.status}`; continue; }

        const buffer   = await vidRes.arrayBuffer();
        const outB64   = Buffer.from(buffer).toString("base64");
        const mimeType = vidRes.headers.get("content-type") || "video/mp4";

        return res.status(200).json({ videoB64: outB64, mimeType });
      } catch (e: any) {
        if (e.message?.includes("Quota exceeded")) {
          return res.status(429).json({ error: e.message });
        }
        lastErr = e.message || "Unknown error";
        continue;
      }
    }

    res.status(500).json({ error: lastErr || "All Veo models failed" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Video extension failed" });
  }
}