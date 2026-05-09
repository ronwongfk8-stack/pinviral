// lib/gemini.ts — all Gemini calls, server-side only
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY || "";

const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash-001", "gemini-2.0-flash"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function geminiText(
  prompt: string,
  opts: { jsonMode?: boolean; parts?: any[] } = {}
): Promise<string> {
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY not configured on server");

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
          // Skip thinking parts (gemini-2.5-flash)
          let textPart = parts.find(
            (p: any) => typeof p.text === "string" && p.thought !== true
          );
          if (!textPart)
            textPart = parts.find(
              (p: any) => typeof p.text === "string" && p.text.trim().length > 0
            );
          let text = textPart?.text ?? "";
          // Strip markdown code fences
          text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
          return text;
        }

        const errData = await res.json().catch(() => ({}));
        const msg = errData?.error?.message || `HTTP ${res.status}`;
        if (res.status === 401 || res.status === 403) throw new Error("Invalid Gemini API key");
        if (res.status === 429) throw new Error("Gemini quota exceeded. Please wait a minute.");
        if (res.status === 503) {
          if (attempt < 2) { await sleep(3000 * (attempt + 1)); continue; }
          break;
        }
        break; // 404/400 = model unavailable, try next
      } catch (e: any) {
        const msg = e.message || "";
        if (msg.includes("Invalid") || msg.includes("quota") || msg.includes("429")) throw e;
        if (attempt < 2 && (msg.includes("503") || msg.includes("UNAVAILABLE"))) {
          await sleep(3000 * (attempt + 1)); continue;
        }
        break;
      }
    }
  }
  throw new Error("AI temporarily unavailable. Please try again in 30 seconds.");
}

// Image generation — tries Imagen 4 first, then Gemini image models
const IMAGE_MODELS = [
  { name: "imagen-4.0-generate-001",      type: "imagen" },
  { name: "gemini-2.5-flash-image",       type: "gemini" },
  { name: "gemini-3.1-flash-image-preview", type: "gemini" },
  { name: "gemini-3-pro-image-preview",   type: "gemini" },
  { name: "imagen-4.0-fast-generate-001", type: "imagen" },
];

export async function geminiImage(
  prompt: string,
  imageB64?: string,
  imageMime?: string
): Promise<string> {
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY not configured on server");

  for (const { name, type } of IMAGE_MODELS) {
    for (let att = 0; att < 3; att++) {
      try {
        let b64: string | null = null;

        if (type === "imagen") {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${name}:predict?key=${GEMINI_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                instances: [{ prompt }],
                parameters: { sampleCount: 1, aspectRatio: "2:3" },
              }),
            }
          );
          if (res.ok) {
            const data = await res.json();
            b64 = data?.predictions?.[0]?.bytesBase64Encoded || null;
          } else {
            const err = await res.json().catch(() => ({}));
            if (res.status === 429) throw new Error("Quota exceeded");
            if (res.status === 503 && att < 2) { await sleep(3000 * (att + 1)); continue; }
            break; // 404/400 = not available
          }
        } else {
          // Gemini image model
          const parts: any[] = [{ text: prompt }];
          if (imageB64 && imageMime) {
            parts.push({ inlineData: { data: imageB64, mimeType: imageMime } });
          }
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${name}:generateContent?key=${GEMINI_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ role: "user", parts }],
                generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
              }),
            }
          );
          if (res.ok) {
            const data = await res.json();
            const resParts = data?.candidates?.[0]?.content?.parts || [];
            for (const p of resParts) {
              const found = p.inlineData?.data || p.inline_data?.data;
              if (found) { b64 = found; break; }
            }
          } else {
            const err = await res.json().catch(() => ({}));
            if (res.status === 429) throw new Error("Quota exceeded");
            if (res.status === 503 && att < 2) { await sleep(3000 * (att + 1)); continue; }
            break;
          }
        }

        if (b64) return b64;
        break; // empty response, try next model
      } catch (e: any) {
        const msg = e.message || "";
        if (msg.includes("Quota exceeded") || msg.includes("429")) throw e;
        if (msg.includes("503") || msg.includes("UNAVAILABLE")) {
          if (att < 2) { await sleep(3000 * (att + 1)); continue; }
        }
        break;
      }
    }
  }
  throw new Error("Image generation failed. All models unavailable — please try again.");
}