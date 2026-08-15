// api/generate.ts — strategy/text generation. Costs 1 credit, same pool as images
// (matches CREATION_COSTS.STRATEGY in the frontend).
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getOrCreateUser, deductImageByEmail, refundImageByEmail } from "../lib/db.js";

export const config = { runtime: "nodejs" };

const MODELS = ["gemini-2.5-flash", "gemini-2.5-pro"]; // confirmed via AI Studio's model reference for this project
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function getClientIp(req: VercelRequest): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0].trim();
  if (Array.isArray(fwd)) return fwd[0];
  return (req.socket as any)?.remoteAddress || "";
}

async function geminiText(prompt: string, opts: { jsonMode?: boolean; parts?: any[] } = {}): Promise<string> {
  const KEY = process.env.GEMINI_API_KEY || process.env.VITE_API_KEY || process.env.API_KEY || "";
  if (!KEY) throw new Error("GEMINI_API_KEY not set in Vercel environment variables");
  const contentParts = opts.parts ?? [{ text: prompt }];
  const genConfig = opts.jsonMode ? { generationConfig: { responseMimeType: "application/json" } } : {};
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`,
          { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: contentParts }], ...genConfig }) }
        );
        if (res.ok) {
          const data = await res.json();
          const parts = data?.candidates?.[0]?.content?.parts || [];
          let textPart = parts.find((p: any) => typeof p.text === "string" && p.thought !== true);
          if (!textPart) textPart = parts.find((p: any) => typeof p.text === "string" && p.text.trim().length > 0);
          let text = textPart?.text ?? "";
          text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
          return text;
        }
        const errData = await res.json().catch(() => ({}));
        const msg = errData?.error?.message || `HTTP ${res.status}`;
        if (res.status === 401 || res.status === 403) throw new Error("Invalid Gemini API key: " + msg);
        if (res.status === 429) throw new Error("Gemini quota exceeded. Please wait a minute.");
        if (res.status === 503) { if (attempt < 2) { await sleep(3000 * (attempt + 1)); continue; } break; }
        break;
      } catch (e: any) {
        const msg = e.message || "";
        if (msg.includes("Invalid") || msg.includes("quota") || msg.includes("429")) throw e;
        if (attempt < 2 && (msg.includes("503") || msg.includes("UNAVAILABLE"))) { await sleep(3000 * (attempt + 1)); continue; }
        break;
      }
    }
  }
  throw new Error("AI temporarily unavailable. Please try again.");
}

// Only "strategy" calls cost a credit — matches the existing product design
// where analyzeUploadedImage (auto-triggered on URL entry) and enhanceSEO
// are free perks with no client-side deduction. `type` is client-declared,
// so a determined user could mislabel a strategy call as "analyze" to dodge
// the charge — but the worst case there is a few free TEXT calls (cheap),
// not free images/videos, so this is an acceptable tradeoff to keep the
// free features actually free without over-engineering this endpoint.
const METERED_TYPES = new Set(["strategy"]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { prompt, parts, jsonMode, email, fingerprint, type } = req.body as {
      prompt?: string; parts?: any[]; jsonMode?: boolean; email?: string; fingerprint?: string; type?: string;
    };
    if (!email || !email.includes("@")) return res.status(400).json({ error: "email is required" });

    const metered = METERED_TYPES.has(type || "");
    const ip = getClientIp(req);
    const user = await getOrCreateUser(email, fingerprint, ip);

    if (metered) {
      if (user.images_left <= 0) {
        return res.status(402).json({ error: "No credits remaining. Please upgrade or top up.", images_left: 0 });
      }
      const deducted = await deductImageByEmail(email);
      if (!deducted) {
        return res.status(402).json({ error: "No credits remaining. Please upgrade or top up.", images_left: 0 });
      }
    }

    try {
      const text = await geminiText(prompt || "", { jsonMode: jsonMode || false, parts: parts || undefined });
      res.status(200).json({ text });
    } catch (genErr) {
      if (metered) await refundImageByEmail(email);
      throw genErr;
    }
  } catch (err: any) {
    const msg = err.message || "Generation failed";
    res.status(msg.includes("quota") || msg.includes("429") ? 429 : 500).json({ error: msg });
  }
}