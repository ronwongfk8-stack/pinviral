// api/generate.ts — all Gemini text calls, server-side
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { geminiText } from "../lib/gemini";

export const config = { runtime: "nodejs" };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { prompt, parts, jsonMode, userId } = req.body as {
      prompt?: string;
      parts?: any[];
      jsonMode?: boolean;
      userId?: string;
    };

    // Log generation if db is available (non-fatal if not)
    if (userId) {
      try {
        const { db } = await import("../lib/db");
        if (db) await db.from("generation_log").insert({ user_id: userId, type: "strategy" });
      } catch {}
    }

    const text = await geminiText(prompt || "", { jsonMode: jsonMode || false, parts: parts || undefined });
    res.status(200).json({ text });
  } catch (err: any) {
    const msg = err.message || "Generation failed";
    const status = msg.includes("quota") || msg.includes("429") ? 429 : 500;
    res.status(status).json({ error: msg });
  }
}