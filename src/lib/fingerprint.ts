// src/lib/fingerprint.ts
//
// Lightweight browser fingerprint — no external dependency. Combines a few
// stable-ish signals (canvas rendering, screen, timezone, user agent) into
// one hash. This is a SOFT signal for free-trial abuse detection, not a
// hard identity check — it survives normal browsing but not a determined
// user switching browsers/profiles or spoofing canvas output. That's an
// acceptable tradeoff for "raise the bar on casual abuse" rather than
// "make it impossible."
//
// The result is cached in localStorage so it's stable across page loads
// for the same browser profile.

function canvasSignal(): string {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    canvas.width = 200;
    canvas.height = 50;
    ctx.textBaseline = "top";
    ctx.font = "14px Arial";
    ctx.fillStyle = "#f60";
    ctx.fillRect(0, 0, 100, 30);
    ctx.fillStyle = "#069";
    ctx.fillText("pinviral-fp", 2, 2);
    return canvas.toDataURL();
  } catch {
    return "";
  }
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function getFingerprint(): Promise<string> {
  const cached = localStorage.getItem("pinviral_fp");
  if (cached) return cached;

  const signals = [
    navigator.userAgent,
    navigator.language,
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    String(navigator.hardwareConcurrency || ""),
    canvasSignal(),
  ].join("|");

  const hash = await sha256(signals);
  localStorage.setItem("pinviral_fp", hash);
  return hash;
}