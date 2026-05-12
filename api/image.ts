// api/image.ts — self-contained, no external lib imports
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { runtime: "nodejs" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const IMAGE_MODELS = [
  { name: "imagen-4.0-generate-001",        type: "imagen" },
  { name: "gemini-2.5-flash-image",         type: "gemini" },
  { name: "gemini-3.1-flash-image-preview", type: "gemini" },
  { name: "gemini-3-pro-image-preview",     type: "gemini" },
  { name: "imagen-4.0-fast-generate-001",   type: "imagen" },
];

async function geminiImage(prompt: string, imageB64?: string, imageMime?: string): Promise<string> {
  const KEY = process.env.GEMINI_API_KEY || process.env.VITE_API_KEY || process.env.API_KEY || "";
  if (!KEY) throw new Error("GEMINI_API_KEY not set in Vercel environment variables");
  for (const { name, type } of IMAGE_MODELS) {
    for (let att = 0; att < 3; att++) {
      try {
        let b64: string | null = null;
        if (type === "imagen") {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${name}:predict?key=${KEY}`,
            { method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: "2:3" } }) }
          );
          if (res.ok) { const d = await res.json(); b64 = d?.predictions?.[0]?.bytesBase64Encoded || null; }
          else { if (res.status === 429) throw new Error("Quota exceeded"); if (res.status === 503 && att < 2) { await sleep(3000*(att+1)); continue; } break; }
        } else {
          const parts: any[] = [{ text: prompt }];
          if (imageB64 && imageMime) parts.push({ inlineData: { data: imageB64, mimeType: imageMime } });
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${name}:generateContent?key=${KEY}`,
            { method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }) }
          );
          if (res.ok) {
            const d = await res.json();
            for (const p of d?.candidates?.[0]?.content?.parts || []) {
              const found = p.inlineData?.data || p.inline_data?.data;
              if (found) { b64 = found; break; }
            }
          } else { if (res.status === 429) throw new Error("Quota exceeded"); if (res.status === 503 && att < 2) { await sleep(3000*(att+1)); continue; } break; }
        }
        if (b64) return b64;
        break;
      } catch (e: any) {
        const msg = e.message || "";
        if (msg.includes("Quota exceeded") || msg.includes("429")) throw e;
        if (msg.includes("503") || msg.includes("UNAVAILABLE")) { if (att < 2) { await sleep(3000*(att+1)); continue; } }
        break;
      }
    }
  }
  throw new Error("Image generation failed. Please try again.");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { prompt, imageB64, imageMime } = req.body as { prompt: string; imageB64?: string; imageMime?: string };
    if (!prompt) return res.status(400).json({ error: "prompt is required" });
    const b64 = await geminiImage(prompt, imageB64, imageMime);
    res.status(200).json({ imageB64: b64 });
  } catch (err: any) {
    const msg = err.message || "Image generation failed";
    res.status(msg.includes("quota") || msg.includes("429") ? 429 : 500).json({ error: msg });
  }
}