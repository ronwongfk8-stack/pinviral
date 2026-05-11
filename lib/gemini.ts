// lib/gemini.ts — all Gemini calls, server-side only

const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash-001", "gemini-2.0-flash"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function getKey(): string {
  return process.env.GEMINI_API_KEY || process.env.VITE_API_KEY || process.env.API_KEY || "";
}

export async function geminiText(
  prompt: string,
  opts: { jsonMode?: boolean; parts?: any[] } = {}
): Promise<string> {
  const GEMINI_KEY = getKey();
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY not set in Vercel environment variables");

  const contentParts = opts.parts ?? [{ text: prompt }];
  const genConfig = opts.jsonMode
    ? { generationConfig: { responseMimeType: "application/json" } }
    : {};

  for (const model of MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: contentParts }], ...genConfig }),
          }
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
