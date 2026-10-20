/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * App 1 UI (PinMotionAI design) + Vercel backend API routing.
 * All AI calls go through /api/generate, /api/image.
 * No direct Gemini SDK usage — the backend handles keys and model selection.
 */

import { useState, useEffect, useRef } from "react";
import JSZip from "jszip";
import {
  Sparkles, Copy, Check, Image as ImageIcon, Loader2, ArrowRight,
  Upload, Download, RefreshCw, Zap, Target, Search, ExternalLink,
  Eye, AlertCircle, Star, Palette, Plus, Hash, Accessibility,
  User, Crown, RotateCw, Play
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { supabase } from "./supabase";
import { getFingerprint } from "./lib/fingerprint";
import { Navbar } from "./studio/components/Navbar";
import { CreationWorkflowBar } from "./studio/components/CreationWorkflowBar";
import { PinCard } from "./studio/components/PinCard";
import { PinterestPreviewModal } from "./studio/components/PinterestPreviewModal";
import { getDefaultPins, PHOTOGRAPHIC_SCENES } from "./studio/data/samples";
import type { AspectRatio, PinItem, TextOverlaySettings } from "./studio/types";
import { getDimensions, drawGeneratedPhoto, drawTextOverlay } from "./studio/utils/canvasRenderer";

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

// ─── Plans, pricing & pin counts ───────────────────────────────────────────────
const PRICE_IDS = {
  starter: "price_1TXFH8B7i0tTYaLUEEUQmN5i",
  pro:     "price_1TXFGtB7i0tTYaLUas8gyCm4",
  topup:   "price_1U5FVUB7i0tTYaLUtyYBs8GR",
} as const;

// Dollar value of each price (used only for analytics events)
const PRICE_VALUES: Record<string, number> = {
  [PRICE_IDS.starter]: 17,
  [PRICE_IDS.pro]: 37,
  [PRICE_IDS.topup]: 9,
};

// Free trial = 3 complete pins (3 images, 3 titles, 3 descriptions, 3 alt texts, 3 boards). Paid = 5.
const FREE_PIN_COUNT = 3;
const FULL_PIN_COUNT = 5;

/** Google Analytics event helper — safe even if gtag is not loaded. */
function track(event: string, params: Record<string, any> = {}) {
  try { (window as any).gtag?.("event", event, params); } catch { /* ignore */ }
}

// ─── Backend API helpers ───────────────────────────────────────────────────────

/** All text/JSON AI calls → /api/generate (Vercel serverless, key lives server-side) */
async function geminiRest(
  prompt: string,
  opts: { jsonMode?: boolean; parts?: any[]; email?: string; type?: string } = {}
): Promise<string> {
  const fingerprint = await getFingerprint().catch(() => "");
  const res = await fetch("/api/generate", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt:      prompt || "",
      parts:       opts.parts  || null,
      jsonMode:    opts.jsonMode || false,
      email:       opts.email || "",
      fingerprint,
      type:        opts.type || "",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Server error ${res.status}`);
  return data.text ?? "";
}

/** Retry once on genuine 503. Never retries 429 (quota). */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 1, delay = 2000): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < maxRetries; i++) {
    try { return await fn(); } catch (err: any) {
      lastErr = err;
      const msg = err.message || String(err);
      if (msg.includes("429") || msg.includes("Too Many") || msg.includes("RESOURCE_EXHAUSTED")) break;
      if (!(msg.includes("503") || msg.includes("UNAVAILABLE")) || i === maxRetries - 1) break;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// ─── Types ─────────────────────────────────────────────────────────────────────
interface ViralAngle {
  title: string; seoTitle: string; hook: string; psychology: string;
  headlines: string[]; subtext: string[]; cta: string; pinDescription: string;
  hashtags: string[]; altText: string;
  aiImagePrompt: string;
}
interface PinStrategy { angles: ViralAngle[]; }

// ─── JSON extractor ────────────────────────────────────────────────────────────
const extractAndParseJSON = (text: string): any => {
  if (!text) return {};
  try { return JSON.parse(text); } catch {
    const block = text.match(/```json\n?([\s\S]*?)\n?```/);
    if (block) { try { return JSON.parse(block[1].trim()); } catch {} }
    const braces = text.match(/\{[\s\S]*\}/);
    if (braces) { try { return JSON.parse(braces[0]); } catch {} }
    return {};
  }
};


const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Resize + re-encode the uploaded photo so requests stay well under Vercel's 4.5 MB body limit. */
async function prepareImageForApi(src: string, maxSize = 1536): Promise<{ b64: string; mime: string }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("Could not read the product image."));
    im.src = src;
  });
  const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  return { b64: dataUrl.split(",")[1], mime: "image/jpeg" };
}

/** Same identity lock the live app used ("direct" mode): the product is a fixed asset, only the scene changes. */
function buildImagePrompt(scene: string): string {
  return (
    "The product in the reference image is a FIXED ASSET. Reproduce it with 100% visual accuracy \u2014 identical shape, proportions, color, material, texture, logo, and every design detail. Do not redesign, restyle, or alter the product in any way. If a person is wearing or holding the product, keep the same person and the same product, and only change their pose and the location. Your only job is to place this exact product into the new scene described below, with realistic lighting, shadows, reflections, and perspective so it looks like a real photograph taken in that location.\n\n" +
    `Scene to place the product in: ${scene}\n\n` +
    "IMPORTANT \u2014 the identity lock above applies ONLY to the product itself. The BACKGROUND, SETTING, and ENVIRONMENT must be completely different from the reference photo \u2014 do not reuse its plain/studio/neutral backdrop. Fully commit to the new scene: real location, real lighting, real atmosphere. This is NOT a cut-out and NOT a product pasted on a flat or solid colour background.\n\n" +
    "CRITICAL: Do NOT include any text, words, letters, captions, titles, logos (other than the product's own existing branding), watermarks, or typography anywhere in this image. All text is added separately afterward as a design overlay.\n\n" +
    "Professional Pinterest product photography. Sharp focus on the product as the clear focal point, natural depth of field, lighting consistent with the described scene, lifestyle aesthetic. This must look like a real photograph, not an illustration, render, poster, or advertisement graphic."
  );
}

function socialBadgeText(sp: { stars?: number; reviews?: string; sold?: string } | null): string {
  if (!sp) return "";
  const bits: string[] = [];
  if (sp.stars) bits.push(`\u2605 ${sp.stars}`);
  if (sp.reviews) bits.push(String(sp.reviews));
  else if (sp.sold) bits.push(String(sp.sold));
  return bits.join(" \u00b7 ");
}

// ─── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  // ── Studio state (new UI) ─────────────────────────────────────────────────
  const [aspectRatio, setAspectRatio]       = useState<AspectRatio>("9:16");
  const [uploadedImage, setUploadedImage]   = useState<string | null>(null);
  const [productName, setProductName]       = useState("");
  const [productUrl, setProductUrl]         = useState("");
  const [pins, setPins]                     = useState<PinItem[]>(() => getDefaultPins("", ""));
  const [selectedPinId, setSelectedPinId]   = useState("all");
  const [previewPin, setPreviewPin]         = useState<PinItem | null>(null);
  const [hasGenerated, setHasGenerated]     = useState(false);
  const [isLoading, setIsLoading]           = useState(false);          // SEO/strategy step
  const [isGeneratingImages, setIsGeneratingImages] = useState(false); // image calls
  const [error, setError]                   = useState<string | null>(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [socialProof, setSocialProof]       = useState<{ stars?: number; reviews?: string; sold?: string } | null>(null);
  const [notification, setNotification]     = useState<string | null>(null);
  const pinsRef = useRef<PinItem[]>(pins);
  useEffect(() => { pinsRef.current = pins; }, [pins]);
  // The photo + product name the CURRENT set of pins was generated from (so "Redo" always uses the same product)
  const sourceRef = useRef<{ b64: string; mime: string; title: string } | null>(null);

  // Landing page hero — click-to-play demo video
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoStarted, setVideoStarted] = useState(false);

  const [userName, setUserName]                       = useState("");
  const [userEmail, setUserEmail]                     = useState("");
  const [userTier, setUserTier]                       = useState<"free" | "starter" | "pro" | "scale">("free");
  const [generationsUsed, setGenerationsUsed]         = useState(0);
  const [imagesLeft, setImagesLeft]                   = useState<number | null>(null); // actual DB value
  const [imagesTotal, setImagesTotal]                 = useState<number | null>(null); // actual DB total
  const [showUpgradeModal, setShowUpgradeModal]       = useState(false);
  const [showOutOfCreditsModal, setShowOutOfCreditsModal] = useState(false);

  const [showEmailModal, setShowEmailModal]           = useState(false);
  const [emailModalMode, setEmailModalMode]           = useState<"start" | "checkout">("start");
  const [pendingPriceId, setPendingPriceId]           = useState<string | null>(null);
  const [emailInput, setEmailInput]                   = useState("");
  const [paymentSuccess, setPaymentSuccess]           = useState(false);
  const [isLoadingUser, setIsLoadingUser]             = useState(false);


  // Free trial = 1 credit for the SEO text + 3 images = 4 credits (backend must grant free users 4)
  const TIER_LIMITS = { free: 4, starter: 100, pro: 400, scale: 999999 };
  const TIER_NAMES = { free: "Free Trial", starter: "Starter", pro: "Pro", scale: "Scale" };

  // Prefer real DB value — handles top-ups correctly (starter+pro = 250, not capped at 200)
  const generationsLeft = imagesLeft !== null ? imagesLeft : TIER_LIMITS[userTier] - generationsUsed;
  const generationsTotal = imagesTotal !== null ? imagesTotal : TIER_LIMITS[userTier];
  const LOW_CREDIT_THRESHOLD = 10;
  const isLowCredit = generationsLeft <= LOW_CREDIT_THRESHOLD && generationsLeft > 0 && userTier !== "free";

  const previewRef = useRef<HTMLDivElement>(null);

  // ── Force canvas to exact aspect ratio height regardless of flex parent ───────
  const CREATION_COSTS = { STRATEGY: 1, IMAGE: 1 };

  // ── Open the email step, then Stripe, for a given price (prefills known email) ──
  const openCheckout = (priceId: string) => {
    setPendingPriceId(priceId);
    setEmailModalMode("checkout");
    setEmailInput(userEmail || "");
    setShowEmailModal(true);
  };

  // Track when the "out of credits" wall is shown
  useEffect(() => {
    if (showOutOfCreditsModal) track("out_of_credits_shown", { plan: userTier });
  }, [showOutOfCreditsModal]);

  // ── Activate plan directly via email + priceId ───────────────────────────────
  const activatePlan = async (email: string, priceId: string) => {
    setIsLoadingUser(true);
    try {
      const res = await fetch("/api/activate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, priceId }),
      });
      const data = await res.json();
      console.log("[activatePlan] response:", JSON.stringify(data));
      if (!res.ok) throw new Error(data.error);
      setUserTier(data.plan as any);
      // Use actual values from server — top-ups add to existing balance.
      if (data.images_left != null) {
        setImagesLeft(data.images_left);
        setImagesTotal(data.images_total ?? data.images_left);
        setGenerationsUsed(data.images_total != null ? data.images_total - data.images_left : 0);
      }
      setUserEmail(email);
      localStorage.setItem("pinviral_email", email);
    } catch (err: any) {
      console.error("[activatePlan] error:", err.message);
      loadUserFromSupabase(email);
    } finally {
      setIsLoadingUser(false);
    }
  };

  // ── Load user from Supabase on mount (handles post-payment redirect) ─────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment   = params.get("payment");
    const email     = params.get("email");
    const sessionId = params.get("session_id");
    const priceId   = params.get("price_id");

    console.log("[mount] payment:", payment, "email:", email, "sessionId:", sessionId);

    if (payment === "success" && email) {
      track("purchase", {
        transaction_id: sessionId || undefined,
        currency: "USD",
        value: PRICE_VALUES[priceId || ""] ?? 0,
        items: priceId ? [{ item_id: priceId }] : undefined,
      });
      setPaymentSuccess(true);
      setUserEmail(email);
      localStorage.setItem("pinviral_email", email);
      window.history.replaceState({}, "", "/");
      window.scrollTo({ top: 0, behavior: "smooth" });
      console.log("[mount] priceId:", priceId);
      if (priceId) {
        activatePlan(email, priceId).then(() => {
          // Auto-dismiss banner after 5s once activation is done
          setTimeout(() => setPaymentSuccess(false), 5000);
        });
      } else {
        console.warn("[mount] No price_id in URL — falling back to Supabase");
        loadUserFromSupabase(email);
        setTimeout(() => setPaymentSuccess(false), 5000);
      }
    } else {
      const saved = localStorage.getItem("pinviral_email");
      if (saved) {
        setUserEmail(saved);
        loadUserFromSupabase(saved);
      }
    }
  }, []);

  const loadUserFromSupabase = async (email: string, retries = 0): Promise<void> => {
    setIsLoadingUser(true);
    try {
      const res = await fetch(`/api/get-user?email=${encodeURIComponent(email)}`);
      if (!res.ok) {
        if (retries < 6) setTimeout(() => loadUserFromSupabase(email, retries + 1), 2000);
        return;
      }
      const data = await res.json();
      const user = data.user;
      if (!user) {
        if (retries < 6) setTimeout(() => loadUserFromSupabase(email, retries + 1), 2000);
        return;
      }
      localStorage.setItem("pinviral_email", email);
      setUserEmail(email);
      setUserTier(user.plan as any);
      setImagesLeft(user.images_left);
      setImagesTotal(user.images_total);
      setGenerationsUsed(user.images_total - user.images_left);
    } catch { /* non-fatal */ }
    finally { setIsLoadingUser(false); }
  };

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  // Real social proof (from /api/generate analyze call) → badge on every pin
  useEffect(() => {
    const t = socialBadgeText(socialProof);
    setPins(prev => prev.map(p => ({ ...p, overlay: { ...p.overlay, badgeText: t, showBadge: !!t } })));
  }, [socialProof]);

  // Auto-fetch social proof when URL is entered
  useEffect(() => {
    const t = setTimeout(() => {
      if (productUrl.length > 8 && !isAnalyzingImage && !socialProof)
        analyzeUploadedImage(null, productUrl);
    }, 2000);
    return () => clearTimeout(t);
  }, [productUrl]);

  // ── Analyze image / URL for social proof (free perk) ──────────────────────
  const analyzeUploadedImage = async (imageData: string | null, url?: string) => {
    if (!imageData && !url) return;
    if (!userEmail) return;
    setIsAnalyzingImage(true);
    try {
      const parts: any[] = [];
      if (imageData?.startsWith("data:"))
        parts.push({ inlineData: { data: imageData.split(",")[1], mimeType: imageData.split(";")[0].split(":")[1] } });
      const fu = url && !url.startsWith("http") ? `https://${url}` : url;
      parts.push({ text:
        `Analyze this product.${fu ? ` URL: ${fu}.` : ""}
Detect star ratings, review counts, sold counts.
Return ONLY valid JSON, no markdown:
{"hasSocialProof":boolean,"stars":number|null,"reviews":string|null,"sold":string|null}
Only report numbers that are actually visible or retrievable; never invent them.` });
      const raw    = await geminiRest("", { jsonMode: true, parts, email: userEmail }).catch(() => "{}");
      const result = extractAndParseJSON(raw);
      if (result.hasSocialProof) setSocialProof({ stars: result.stars, reviews: result.reviews, sold: result.sold });
    } catch { /* non-fatal */ }
    finally { setIsAnalyzingImage(false); }
  };

  const handleUploadImage = (file: File) => {
    if (!file.type.startsWith("image/")) { showToast("Please upload an image file (PNG, JPG or WEBP)."); return; }
    const reader = new FileReader();
    reader.onloadend = () => {
      const d = reader.result as string;
      setUploadedImage(d);
      analyzeUploadedImage(d, productUrl);
    };
    reader.readAsDataURL(file);
  };

  // ── One image → /api/image (1 credit, refunded server-side on failure) ──────
  const generateOneImage = async (pinId: string, scene: string, email: string,
                                  src: { b64: string; mime: string }): Promise<"done" | "nocredit" | "error"> => {
    const patch = (u: Partial<PinItem>) => setPins(prev => prev.map(p => p.id === pinId ? { ...p, ...u } : p));
    patch({ imageStatus: "loading", imageError: undefined });
    try {
      const fingerprint = await getFingerprint().catch(() => "");
      for (let attempt = 0; ; attempt++) {
        const res = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: buildImagePrompt(scene), email, fingerprint,
            imageB64: src.b64, imageMime: src.mime, aspectRatio,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 402) { patch({ imageStatus: "nocredit" }); return "nocredit"; }
        if (res.status === 429 && attempt < 2) { await sleep(8000 * (attempt + 1)); continue; }
        if (!res.ok) throw new Error(data?.error || "Image generation failed");
        if (!data.imageB64) throw new Error("No image returned. Please try again.");
        patch({ generatedImageUrl: `data:image/png;base64,${data.imageB64}`, imageStatus: "done" });
        setGenerationsUsed(p => p + CREATION_COSTS.IMAGE);
        setImagesLeft(p => p !== null ? p - CREATION_COSTS.IMAGE : null);
        return "done";
      }
    } catch (err: any) {
      patch({ imageStatus: "error", imageError: err?.message || "Image generation failed" });
      return "error";
    }
  };

  // Generate the images (3 for free, 5 for paid), 2 at a time, as many as the user's credits allow
  const runImages = async (list: PinItem[], email: string, credits: number,
                           src: { b64: string; mime: string }) => {
    setIsGeneratingImages(true);
    const allowed = list.slice(0, Math.max(0, credits));
    const skipped = list.slice(allowed.length);
    if (skipped.length)
      setPins(prev => prev.map(p => skipped.some(s => s.id === p.id) ? { ...p, imageStatus: "nocredit" } : p));

    let next = 0;
    const worker = async () => {
      while (next < allowed.length) {
        const pin = allowed[next++];
        await generateOneImage(pin.id, pin.visualPrompt, email, src);
      }
    };
    await Promise.all([worker(), worker()]);

    setIsGeneratingImages(false);
    loadUserFromSupabase(email).catch(() => {}); // sync true balance (failed images are refunded)
    if (skipped.length) {
      showToast(`Out of credits \u2014 ${skipped.length} image${skipped.length > 1 ? "s" : ""} not created yet.`);
      setShowOutOfCreditsModal(true);
    } else {
      track("pins_generated", { pins: list.length });
      showToast(`Done! Your product appears in ${list.length} different settings.`);
    }
  };

  // ── Generate: SEO/strategy (/api/generate, 1 credit) + images (/api/image, 1 credit each) ──
  const handleGenerate = async (emailOverride?: string) => {
    if (isLoading || isGeneratingImages) return;
    if (!uploadedImage) { setError("Upload a product photo first."); return; }
    if (!productName.trim()) { setError("Enter the product name first."); return; }
    const email = emailOverride || userEmail;
    if (!email) { setEmailModalMode("start"); setShowEmailModal(true); return; }
    if (generationsLeft < CREATION_COSTS.STRATEGY + CREATION_COSTS.IMAGE) { setShowOutOfCreditsModal(true); return; }

    // Free trial gets 3 full pins; paid plans get all 5
    const pinCount = userTier === "free" ? FREE_PIN_COUNT : FULL_PIN_COUNT;

    setIsLoading(true); setError(null);
    try {
      const prepared = await prepareImageForApi(uploadedImage);
      const fullUrl = productUrl && !productUrl.startsWith("http") ? `https://${productUrl}` : productUrl;
      const prompt = `You are a Pinterest viral growth expert + e-commerce SEO strategist.
Create ${pinCount} high-converting Pinterest pin strategies for: "${productName}".${fullUrl ? `\nProduct/store URL: ${fullUrl}` : ""}
Visual vibe: Professional, Aesthetic, Lifestyle-focused.
Target: impulse buyers, home decor, lifestyle, problem-solving audiences.

For each angle provide:
1. title (angle name)
2. seoTitle (50-85 characters, high-CTR pin title). It must describe ONLY the product, its standout features and the keywords buyers search for. NEVER mention a location, place, setting or scenery in the title.
3. hook (1-line attention grabber)
4. psychology (emotional trigger explanation)
5. aiImagePrompt (60-90 words): a vivid, specific real-world SCENE describing WHERE and HOW this exact product is being used, held, worn or placed - tied to this angle's psychology. Describe the setting, any people/context, pose, lighting and mood. Each of the ${pinCount} angles MUST describe a completely different scene/location/context from the other ${pinCount - 1} - no repeated settings. Describe only the new environment and context - do not redescribe or change the product itself, it stays exactly as shown in the reference photo.
6. headlines (exactly 5 punchy variants)
7. subtext (exactly 3 short social-proof style lines; do not invent specific numbers)
8. cta
9. pinDescription (100+ word SEO-optimised paragraph). Describe the product's features, materials, fit/specs and buyer benefits. Do NOT describe the photo's location or background. The exact product name "${productName}" MUST appear naturally in the text. End with a high-intent call to action.
10. hashtags (exactly 10 relevant tags)
11. altText (accessibility description of the pin image: the product, its cut/material/details and how it is styled)

NEGATIVE CONSTRAINTS: No generic phrases like "Shop for Trend", "Unlock Your Potential", "Elevate Your Style", "Buy Now".
Return exactly ${pinCount} angles as ONLY valid JSON, no markdown fences, no explanation:
{"angles":[{"title":"","seoTitle":"","hook":"","psychology":"","aiImagePrompt":"","headlines":["","","","",""],"subtext":["","",""],"cta":"","pinDescription":"","hashtags":["","","","","","","","","",""],"altText":""}]}`;

      const text = await withRetry(() => geminiRest(prompt, { jsonMode: true, email, type: "strategy" }));
      const data = extractAndParseJSON(text) as PinStrategy;
      if (!data.angles?.length) throw new Error("No angles returned. Please try again.");
      setGenerationsUsed(p => p + CREATION_COSTS.STRATEGY);
      setImagesLeft(p => p !== null ? p - CREATION_COSTS.STRATEGY : null);

      const defaults = getDefaultPins("", productName).slice(0, pinCount);
      const badge = socialBadgeText(socialProof);
      const newPins: PinItem[] = defaults.map((d, i) => {
        const a = data.angles[i % data.angles.length];
        return {
          ...d,
          id: `pin-${i + 1}`,
          environmentName: a.title || d.environmentName,
          title: a.seoTitle,
          seoDescription: a.pinDescription,
          board: a.title,
          altText: a.altText,
          tags: (a.hashtags || []).map(h => (h.startsWith("#") ? h : `#${h}`)),
          visualPrompt: a.aiImagePrompt,
          generatedImageUrl: undefined,
          imageStatus: "loading" as const,
          imageError: undefined,
          overlay: {
            ...d.overlay,
            headline: a.headlines?.[0] || d.overlay.headline,
            subtitle: a.subtext?.[0] || "",
            ctaText: a.cta || d.overlay.ctaText,
            badgeText: badge,
            showBadge: !!badge,
          },
        };
      });

      sourceRef.current = { ...prepared, title: productName };
      setPins(newPins);
      setHasGenerated(true);
      setSelectedPinId("all");
      setIsLoading(false);
      showToast(`SEO ready! Creating ${pinCount} images from your product photo...`);
      await runImages(newPins, email, generationsLeft - CREATION_COSTS.STRATEGY, prepared);
    } catch (err: any) {
      const msg = err.message || "";
      if (/credit/i.test(msg)) setShowOutOfCreditsModal(true);
      setError(
        msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED")
          ? "Rate limit -- please wait 15 seconds and try again."
          : msg || "Failed to generate. Please try again."
      );
    } finally { setIsLoading(false); }
  };

  // Redo ONE image (optionally in a different setting) — 1 credit
  const handleRegeneratePinImage = async (pinId: string, sceneId?: string) => {
    const src = sourceRef.current;
    if (!src) { showToast("Generate your pins first."); return; }
    if (!userEmail) { setEmailModalMode("start"); setShowEmailModal(true); return; }
    if (generationsLeft < CREATION_COSTS.IMAGE) { setShowOutOfCreditsModal(true); return; }
    const pin = pinsRef.current.find(p => p.id === pinId);
    if (!pin) return;
    let scene = pin.visualPrompt;
    if (sceneId) {
      const sc = PHOTOGRAPHIC_SCENES.find(s => s.id === sceneId);
      if (sc) {
        scene = sc.tagline;
        setPins(prev => prev.map(p => p.id === pinId
          ? { ...p, environmentStyle: sc.style, environmentName: sc.name, visualPrompt: sc.tagline } : p));
      }
    }
    await generateOneImage(pinId, scene, userEmail, src);
    loadUserFromSupabase(userEmail).catch(() => {});
  };

  const handleUpdateOverlay = (pinId: string, partial: Partial<TextOverlaySettings>) => {
    setPins(prev => prev.map(pin => (pinId === "all" || pin.id === pinId)
      ? { ...pin, overlay: { ...pin.overlay, ...partial } } : pin));
  };
  const handleUpdatePin = (pinId: string, updates: Partial<PinItem>) => {
    setPins(prev => prev.map(pin => (pin.id === pinId ? { ...pin, ...updates } : pin)));
  };

  // ── Downloads ────────────────────────────────────────────────────────────
  const handleDownloadAllZip = async () => {
    const ready = pins.filter(p => p.generatedImageUrl);
    if (!hasGenerated || !ready.length) { showToast("Generate your pins first."); return; }
    showToast("Packaging your pins into a ZIP...");
    const zip = new JSZip();
    const { width, height } = getDimensions(aspectRatio);
    try {
      for (let i = 0; i < pins.length; i++) {
        const pin = pins[i];
        if (!pin.generatedImageUrl) continue;
        const photo = await new Promise<HTMLImageElement | null>(resolve => {
          const im = new Image();
          im.onload = () => resolve(im);
          im.onerror = () => resolve(null);
          im.src = pin.generatedImageUrl!;
        });
        if (!photo) continue;
        const c = document.createElement("canvas");
        c.width = width; c.height = height;
        const ctx = c.getContext("2d");
        if (!ctx) continue;
        drawGeneratedPhoto(ctx, photo, width, height);
        drawTextOverlay(ctx, width, height, pin.overlay);
        zip.file(`Pin_${i + 1}_${aspectRatio.replace(":", "x")}.png`,
          c.toDataURL("image/png", 1.0).replace(/^data:image\/png;base64,/, ""), { base64: true });
      }
      let guide = `PinViral - Pinterest Pin Package\nGenerated: ${new Date().toLocaleDateString()}\nAspect ratio: ${aspectRatio}\n\n`;
      pins.forEach((p, idx) => {
        guide += `--- PIN #${idx + 1} ---\nTITLE:\n${p.title}\n\nSEO DESCRIPTION:\n${p.seoDescription}\n\nBOARD:\n${p.board}\n\nALT TEXT:\n${p.altText}\n\nTAGS:\n${p.tags.join(" ")}\n\n\n`;
      });
      zip.file("PINTEREST_SEO_DESCRIPTIONS.txt", guide);
      const blob = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `PinViral_Pins_${aspectRatio.replace(":", "x")}.zip`;
      link.click();
      showToast("ZIP downloaded.");
    } catch (err) {
      console.error("ZIP failed:", err);
      showToast("Could not build the ZIP. Download pins one by one instead.");
    }
  };

  const handleCopyAllMetadata = () => {
    if (!hasGenerated) { showToast("Generate your pins first."); return; }
    let text = `PINVIRAL - ${pins.length} PINTEREST PIN PACKAGES\n\n`;
    pins.forEach((p, idx) => {
      text += `PIN #${idx + 1}\nTITLE:\n${p.title}\n\nSEO DESCRIPTION:\n${p.seoDescription}\n\nBOARD:\n${p.board}\n\nALT TEXT:\n${p.altText}\n\nTAGS:\n${p.tags.join(" ")}\n\n\n`;
    });
    navigator.clipboard.writeText(text);
    showToast(`Copied SEO text for all ${pins.length} pins.`);
  };

  const resetApp = () => {
    setProductName(""); setProductUrl(""); setUploadedImage(null); setSocialProof(null);
    setPins(getDefaultPins("", "")); setHasGenerated(false); setError(null);
    setSelectedPinId("all"); sourceRef.current = null;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── First-time email capture (before any free generation, not just checkout) ──
  const confirmStartEmail = () => {
    if (!emailInput.includes("@")) return;
    const email = emailInput.trim().toLowerCase();
    track("generate_lead", { method: "free_trial_email" });
    setUserEmail(email);
    localStorage.setItem("pinviral_email", email);
    setShowEmailModal(false);
    setEmailInput("");
    // Sync real credit balance in the background in case this is a
    // returning email — doesn't block continuing below.
    loadUserFromSupabase(email).catch(() => {});
    handleGenerate(email);
  };

  // ── Checkout with email ───────────────────────────────────────────────────────
  const handleProceedToCheckout = async () => {
    const email = emailInput.trim().toLowerCase();
    if (!email.includes("@") || !pendingPriceId) return;

    // Open the Stripe tab NOW, inside the click, so popup blockers (Safari / mobile) allow it.
    // We point it at Stripe once the server returns the checkout URL.
    const stripeTab = window.open("", "_blank");

    setShowEmailModal(false);
    setUserEmail(email);
    localStorage.setItem("pinviral_email", email);
    track("begin_checkout", {
      currency: "USD",
      value: PRICE_VALUES[pendingPriceId] ?? 0,
      items: [{ item_id: pendingPriceId }],
    });

    try {
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId: pendingPriceId, email }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Could not start checkout");

      // If the browser still blocked the new tab, fall back to a normal same-tab redirect.
      // (After paying, Stripe sends the user back and the plan is activated from the URL.)
      if (!stripeTab || stripeTab.closed) {
        window.location.href = data.url;
        return;
      }
      stripeTab.location.href = data.url;
      setPaymentSuccess(false);

      // Poll Supabase every 3s — when plan activates, update state automatically
      const pollInterval = setInterval(async () => {
        try {
          const r = await fetch(`/api/get-user?email=${encodeURIComponent(email)}`);
          const d = await r.json();
          const user = d.user;
          if (user && user.plan !== "free" && user.images_left > 0) {
            clearInterval(pollInterval);
            setUserTier(user.plan as any);
            setImagesLeft(user.images_left);
            setImagesTotal(user.images_total);
            setGenerationsUsed(user.images_total - user.images_left);
            setPaymentSuccess(true);
            setTimeout(() => setPaymentSuccess(false), 5000);
            stripeTab?.close();
          }
        } catch { /* keep polling */ }
      }, 3000);

      // Stop polling after 10 minutes regardless
      setTimeout(() => clearInterval(pollInterval), 600000);

    } catch (err: any) {
      try { stripeTab?.close(); } catch { /* ignore */ }
      alert("Payment failed: " + err.message);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-900 font-sans selection:bg-rose-100 selection:text-rose-600">

      {/* ── Payment Success Banner ───────────────────────────────────────────── */}
      <AnimatePresence>
        {paymentSuccess && (
          <motion.div initial={{ opacity: 0, y: -40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -40 }}
            className="fixed top-0 left-0 right-0 z-[200] bg-emerald-500 text-white px-4 py-3 flex items-center justify-center gap-3 shadow-lg">
            {isLoadingUser
              ? <Loader2 size={18} className="shrink-0 animate-spin"/>
              : <Check size={18} className="shrink-0"/>}
            <span className="font-black text-sm">
              {isLoadingUser
                ? `⏳ Payment received! Activating your plan for ${userEmail}...`
                : `🎉 Activated! Welcome to ${TIER_NAMES[userTier]} — ${generationsTotal} generations ready for ${userEmail}`}
            </span>
            <button onClick={() => setPaymentSuccess(false)} className="ml-4 text-white/80 hover:text-white text-lg leading-none">×</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Email Modal (shown before first free generation, or before checkout) ── */}
      <AnimatePresence>
        {showEmailModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setShowEmailModal(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl"
              onClick={e => e.stopPropagation()}>
              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Crown size={28} className="text-rose-600"/>
                </div>
                <h3 className="text-2xl font-black text-slate-900 mb-2">
                  {emailModalMode === "start" ? "Start Your Free Trial" : "Enter Your Email"}
                </h3>
                <p className="text-slate-500 text-sm font-medium">
                  {emailModalMode === "start"
                    ? "We use your email to track your free generations — no password, no sign-up."
                    : "We'll use this to activate your credits after payment."}
                </p>
              </div>
              <input
                type="email"
                placeholder="you@example.com"
                className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-rose-500 outline-none text-slate-700 font-bold mb-4"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && (emailModalMode === "start" ? confirmStartEmail() : handleProceedToCheckout())}
                autoFocus
              />
              <button
                onClick={emailModalMode === "start" ? confirmStartEmail : handleProceedToCheckout}
                disabled={!emailInput.includes("@")}
                className="w-full py-4 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:cursor-not-allowed text-white font-black rounded-2xl transition-all">
                {emailModalMode === "start" ? "Start Creating →" : "Continue to Payment →"}
              </button>
              <button onClick={() => setShowEmailModal(false)} className="w-full mt-3 py-3 text-slate-400 text-sm font-bold hover:text-slate-600 transition-all">
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-rose-600 rounded-lg flex items-center justify-center text-white"><Sparkles size={18}/></div>
            <h1 className="font-bold text-xl tracking-tight">PinViral</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Generation counter badge */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-xl">
              <Zap size={14} className={generationsLeft <= 3 ? "text-rose-500" : "text-emerald-500"}/>
              <span className="text-[10px] font-black uppercase tracking-widest">
                {generationsUsed}/{generationsTotal} Used
              </span>
              <span className={cn("text-[10px] font-black px-1.5 py-0.5 rounded-md",
                generationsLeft <= 3 ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600")}>
                {generationsLeft} Left
              </span>
            </div>
            {hasGenerated && (
              <button onClick={resetApp} className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition-all">
                <RefreshCw size={14}/> Next Product
              </button>
            )}
            <button onClick={() => setShowUpgradeModal(true)}
              className="flex px-3 sm:px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl shadow-lg shadow-rose-100 uppercase tracking-widest transition-all items-center gap-2">
              <Crown size={14}/> Upgrade
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 lg:py-12">

        {/* ── User info bar (auto-generated) ─────────────────────────── */}
        {!hasGenerated && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="max-w-4xl mx-auto mb-6">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center text-rose-600">
                  <User size={18}/>
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900">{userName || "Guest User"}</p>
                  <p className="text-[10px] text-slate-400 font-bold">{userEmail || "Auto-generated on signup"}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl">
                  <Zap size={14} className={generationsLeft <= 3 ? "text-rose-500" : "text-emerald-500"}/>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                    {generationsUsed}/{generationsTotal} Used
                  </span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-xl">
                  <Crown size={14} className="text-amber-500"/>
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-700">{TIER_NAMES[userTier]}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Studio (new UI) ─────────────────────────────────────────────── */}
        <section className="max-w-7xl mx-auto mb-16">
          <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-rose-50 text-rose-600 text-[11px] font-black px-4 py-1.5 rounded-full uppercase tracking-widest mb-4">
              <Sparkles size={13}/> 1 photo becomes 5 pins
            </div>
            <h2 className="text-4xl sm:text-5xl font-black text-slate-900 mb-4 tracking-tighter">
              {hasGenerated ? `Your ${pins.length} Pins Are Ready` : "Turn one product photo into scroll-stopping pins"}
            </h2>
            <p className="text-slate-500 text-lg font-medium">
              No design skills, no Canva, no hours lost. <span className="text-rose-600 italic">Go Viral.</span>
            </p>
          </div>

          {/* ── Demo video — click to play with real sound and controls,
              not an autoplay background loop. ── */}
          {!hasGenerated && (
            <div className="bg-slate-50 rounded-[2rem] p-6 sm:p-8 mb-10 border border-slate-100">
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-video max-w-2xl mx-auto shadow-xl">
                <video
                  ref={videoRef}
                  src="/showcase/demo.mp4"
                  poster="/showcase/demo-poster.jpg"
                  controls={videoStarted}
                  playsInline
                  onPlay={() => setVideoStarted(true)}
                  className="w-full h-full object-contain bg-black"
                />
                {!videoStarted && (
                  <button
                    onClick={() => videoRef.current?.play()}
                    aria-label="Play demo video"
                    className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-all group">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-xl group-hover:scale-105 transition-transform">
                      <Play size={26} className="text-rose-600 ml-1" fill="currentColor"/>
                    </div>
                  </button>
                )}
              </div>

              <div className="flex justify-center gap-6 flex-wrap mt-6 pt-6 border-t border-slate-200">
                <span className="flex items-center gap-1.5 text-[13px] text-slate-500 font-medium">
                  <Zap size={15}/> Under 2 minutes
                </span>
                <span className="flex items-center gap-1.5 text-[13px] text-slate-500 font-medium">
                  <Palette size={15}/> No design skills needed
                </span>
                <span className="flex items-center gap-1.5 text-[13px] text-slate-500 font-medium">
                  <ImageIcon size={15}/> Product never changes
                </span>
              </div>
            </div>
          )}
          </div>

          <CreationWorkflowBar
            productTitle={productName}
            onProductTitleChange={setProductName}
            productUrl={productUrl}
            onProductUrlChange={setProductUrl}
            subjectImageUrl={uploadedImage || ""}
            onUploadImage={handleUploadImage}
            onGenerate={() => handleGenerate()}
            isGenerating={isLoading || isGeneratingImages}
          />

          <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-3 bg-white rounded-2xl border border-slate-200 mb-4">
            <div className="flex items-center gap-2">
              <Zap size={14} className={generationsLeft <= 3 ? "text-rose-500" : "text-emerald-500"}/>
              <span className="text-[11px] font-bold text-slate-600">
                Credits: <span className="text-slate-900">{generationsLeft}</span> left &middot; one upload uses 1 credit for SEO + 1 per image ({userTier === "free" ? `free trial: 3 pins = ${1 + FREE_PIN_COUNT} credits` : `up to ${1 + FULL_PIN_COUNT}`})
              </span>
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{TIER_NAMES[userTier]}</span>
          </div>

          {isAnalyzingImage && (
            <p className="text-[11px] text-violet-500 font-bold mb-3 flex items-center gap-1 animate-pulse">
              <Loader2 size={11} className="animate-spin"/> Fetching social proof...
            </p>
          )}

          {error && (
            <div className="flex items-start gap-3 p-4 mb-4 bg-rose-50 border border-rose-100 rounded-2xl">
              <AlertCircle size={15} className="text-rose-500 mt-0.5 shrink-0"/>
              <p className="text-xs font-bold text-rose-700 flex-1">{error}</p>
              <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600 text-lg leading-none">&times;</button>
            </div>
          )}

          {isLowCredit && !hasGenerated && (
            <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4">
              <span className="text-xs font-black text-amber-700">Only <span className="text-amber-900">{generationsLeft}</span> generations left!</span>
              <button onClick={() => openCheckout(PRICE_IDS.topup)}
                className="text-[10px] font-black text-white bg-amber-500 hover:bg-amber-600 px-3 py-1.5 rounded-full transition-all shrink-0">
                Top Up $9
              </button>
            </div>
          )}

          {hasGenerated && (
            <>
              <Navbar
                aspectRatio={aspectRatio}
                onAspectRatioChange={setAspectRatio}
                pins={pins}
                selectedPinId={selectedPinId}
                onSelectPinId={setSelectedPinId}
                onUpdateOverlay={handleUpdateOverlay}
                onUploadImage={handleUploadImage}
                onFetchSocialProof={async (url: string) => { setSocialProof(null); await analyzeUploadedImage(null, url); }}
                isGenerating={isLoading || isGeneratingImages}
                isFetchingSocialProof={isAnalyzingImage}
                onDownloadAllZip={handleDownloadAllZip}
                onCopyAllMetadata={handleCopyAllMetadata}
                onRegenerateAll={() => handleGenerate()}
              />
              <div className={cn("grid gap-6 mt-6 grid-cols-1 sm:grid-cols-2",
                (userTier === "free" || pins.length < FULL_PIN_COUNT) ? "lg:grid-cols-4" : "lg:grid-cols-5")}>
                {pins.map((pin, index) => (
                  <PinCard
                    key={pin.id}
                    pin={pin}
                    index={index}
                    aspectRatio={aspectRatio}
                    hasGenerated={hasGenerated}
                    isGenerating={isLoading || isGeneratingImages}
                    onUpdatePin={handleUpdatePin}
                    onSelectForEdit={(id) => { setSelectedPinId(id); showToast(`Pin #${index + 1} selected. Open the menus above to edit.`); }}
                    onOpenPreview={(p) => setPreviewPin(p)}
                    onRegenerateImage={handleRegeneratePinImage}
                  />
                ))}

                {/* Free trial upsell: pins 4 and 5 are part of paid plans */}
                {userTier === "free" && pins.length < FULL_PIN_COUNT && (
                  <div className="rounded-3xl border-2 border-dashed border-rose-200 bg-rose-50/50 p-6 flex flex-col items-center justify-center text-center gap-3 min-h-[280px]">
                    <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center">
                      <Crown size={24} className="text-rose-600"/>
                    </div>
                    <p className="font-black text-slate-900">Unlock 2 more pins</p>
                    <p className="text-xs text-slate-500 font-medium">
                      The free trial includes 3 pins. Paid plans create all 5 pins from one photo.
                    </p>
                    <button onClick={() => setShowUpgradeModal(true)}
                      className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl transition-all">
                      See Plans
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* Empty state */}
        {!hasGenerated && !isLoading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            <FeatureCard icon={<Zap className="text-rose-500"/>} title="Viral Psychology" desc="Proven impulse-buy triggers ensure your pins get saved."/>
            <FeatureCard icon={<Search className="text-rose-500"/>} title="SEO Optimized" desc="Descriptions packed with high-volume Pinterest keywords."/>
            <FeatureCard icon={<ImageIcon className="text-rose-500"/>} title="AI Visuals" desc="Generate stunning product images via Imagen & Gemini."/>
          </motion.div>
        )}

        {/* ── PRICING SECTION ─────────────────────────────────────────────── */}
        <section id="pricing-section" className="py-24 bg-slate-50 border-t border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Section Header */}
            <div className="text-center max-w-3xl mx-auto mb-16">
              <p className="text-rose-600 font-black uppercase tracking-[0.3em] text-xs mb-4">Pricing</p>
              <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-6 tracking-tight leading-tight">
                Simple, Transparent Pricing
              </h2>
              <p className="text-lg text-slate-500 mb-2">
                Start free, upgrade when you&apos;re ready. No hidden fees.
              </p>
              <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full text-sm font-bold mt-4">
                <Check size={16} />
                Monthly plans — top up anytime
              </div>
            </div>

            {/* Pricing Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto items-stretch">
              <PricingCard 
                tier="Free Trial" 
                price="$0" 
                generations="3 pins"
                description="Perfect for testing the platform"
                note="Free trial = 3 complete pins, not the full set of 5. Upgrade to create all 5."
                features={[
                  "3 AI images",
                  "3 SEO titles",
                  "3 SEO descriptions & hashtags",
                  "3 alt texts",
                  "3 Pinterest board names",
                  "Basic image export",
                  "Community support"
                ]} 
                tierKey="free" 
                currentTier={userTier} 
                onSelect={setUserTier}
                onRequestCheckout={openCheckout}
              />
              <PricingCard 
                tier="Starter" 
                price="$17" 
                billing="mo"
                generations="100 generations/month"
                description="For creators getting started"
                features={[
                  "100 AI generations/month",
                  "All 5 pins per product",
                  "All viral strategy features",
                  "AI image generation",
                  "Social proof detection",
                  "Video scripts for Vid.ai & Submagic",
                  "HD image export",
                  "Email support",
                ]} 
                tierKey="starter" 
                currentTier={userTier} 
                onSelect={setUserTier}
                onRequestCheckout={openCheckout}
              />
              <PricingCard 
                tier="Pro" 
                price="$37" 
                billing="mo"
                generations="400 generations/month"
                description="For power sellers & agencies"
                features={[
                  "400 AI generations/month",
                  "Everything in Starter",
                  "Priority processing",
                  "Advanced cloning modes",
                  "4K image export",
                  "Priority support",
                  "Custom visual environments",
                ]} 
                isPopular
                tierKey="pro" 
                currentTier={userTier} 
                onSelect={setUserTier}
                onRequestCheckout={openCheckout}
              />
            </div>

            {/* Top-up pill — for existing subscribers who need more */}
            <div className="mt-8 flex justify-center">
              <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl px-8 py-6 flex flex-col sm:flex-row items-center gap-4 shadow-lg max-w-md w-full">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                    <Zap size={20} className="text-amber-600"/>
                  </div>
                  <div>
                    <p className="font-black text-slate-900 text-sm">Need more credits?</p>
                    <p className="text-xs text-slate-500 font-medium">+50 generations · Any plan · Never expires</p>
                  </div>
                </div>
                <button onClick={() => openCheckout(PRICE_IDS.topup)}
                  className="shrink-0 bg-amber-500 hover:bg-amber-600 text-white font-black text-sm px-6 py-3 rounded-xl transition-all shadow-md shadow-amber-100 whitespace-nowrap">
                  Top Up — $9
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-slate-900 border-t border-white/10 py-16 px-6 text-white mt-12">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-rose-600 rounded-xl flex items-center justify-center shadow-lg shadow-rose-900/40"><Sparkles size={20} className="text-white"/></div>
            <span className="text-2xl font-black tracking-tight">PIN<span className="text-rose-500">VIRAL</span></span>
          </div>
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.3em]">© 2026 PinViral. Not affiliated with Pinterest Inc.</p>
          <div className="flex items-center gap-2 text-emerald-500">
            <div className="w-1.5 h-1.5 bg-current rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]"/>
            <span className="text-[10px] font-black uppercase tracking-widest">Systems Operational</span>
          </div>
        </div>
      </footer>

      {/* Upgrade Modal */}
      <AnimatePresence>
        {showUpgradeModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setShowUpgradeModal(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-8 max-w-lg w-full shadow-2xl"
              onClick={e => e.stopPropagation()}>
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Crown size={32} className="text-rose-600"/>
                </div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-2">Upgrade Your Plan</h3>
                <p className="text-slate-500 text-sm font-medium">
                  You have used <span className="text-rose-600 font-black">{generationsUsed}</span> of <span className="text-slate-900 font-black">{generationsTotal}</span> generations.
                </p>
              </div>
              <div className="space-y-3 mb-8">
                {[
                  { key: "starter" as const, name: "Starter", price: "$17/mo", gens: "100 gens/month", desc: "Best for beginners" },
                  { key: "pro" as const, name: "Pro", price: "$37/mo", gens: "400 gens/month", desc: "Best for power sellers" },
                ].map(plan => (
                  <button key={plan.key} onClick={() => { setShowUpgradeModal(false); openCheckout(PRICE_IDS[plan.key]); }}
                    className={cn("w-full p-4 rounded-2xl border-2 text-left transition-all flex items-center justify-between",
                      userTier === plan.key
                        ? "bg-rose-50 border-rose-600"
                        : "bg-white border-slate-100 hover:border-rose-200")}>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-slate-900">{plan.name}</span>
                        {userTier === plan.key && <span className="text-[9px] font-black text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full">Current</span>}
                      </div>
                      <p className="text-[11px] text-slate-400 font-medium mt-0.5">{plan.desc}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-black text-slate-900">{plan.price}</span>
                      <p className="text-[10px] text-slate-400 font-bold">{plan.gens}</p>
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={() => setShowUpgradeModal(false)}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black text-sm rounded-2xl transition-all">
                Maybe Later
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Out of Credits Modal */}
      <AnimatePresence>
        {showOutOfCreditsModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowOutOfCreditsModal(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl"
              onClick={e => e.stopPropagation()}>
              <div className="text-center mb-6">
                <div className="text-5xl mb-4">🔋</div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-2">You're out of generations</h3>
                <p className="text-slate-500 text-sm font-medium">Choose an option to keep creating viral content</p>
              </div>
              <div className="space-y-3 mb-4">
                <button onClick={() => { setShowOutOfCreditsModal(false); openCheckout(PRICE_IDS.topup); }}
                  className="w-full p-4 rounded-2xl border-2 border-amber-300 bg-amber-50 hover:bg-amber-100 transition-all flex items-center justify-between">
                  <div className="text-left">
                    <p className="font-black text-slate-900 flex items-center gap-2"><Zap size={14} className="text-amber-500"/> Quick Top-Up</p>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">+50 generations · never expires</p>
                  </div>
                  <span className="font-black text-amber-600 text-lg">$9</span>
                </button>
                <button onClick={() => { setShowOutOfCreditsModal(false); openCheckout(PRICE_IDS.starter); }}
                  className="w-full p-4 rounded-2xl border-2 border-slate-200 bg-white hover:border-slate-400 transition-all flex items-center justify-between">
                  <div className="text-left">
                    <p className="font-black text-slate-900">Starter Plan</p>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">100 generations/month</p>
                  </div>
                  <span className="font-black text-slate-900">$17<span className="text-xs text-slate-400 font-medium">/mo</span></span>
                </button>
                <button onClick={() => { setShowOutOfCreditsModal(false); openCheckout(PRICE_IDS.pro); }}
                  className="w-full p-4 rounded-2xl border-2 border-rose-300 bg-rose-50 hover:bg-rose-100 transition-all flex items-center justify-between">
                  <div className="text-left">
                    <p className="font-black text-rose-700 flex items-center gap-2"><Crown size={14}/> Pro Plan</p>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">400 generations/month · Best value</p>
                  </div>
                  <span className="font-black text-rose-600">$37<span className="text-xs text-slate-400 font-medium">/mo</span></span>
                </button>
              </div>
              <button onClick={() => setShowOutOfCreditsModal(false)}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-500 font-black text-sm rounded-2xl transition-all">
                Maybe Later
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {notification && (
        <div className="fixed bottom-6 right-6 z-[60] bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold border border-slate-700">
          <Sparkles size={14} className="text-amber-400"/>
          <span>{notification}</span>
        </div>
      )}

      {previewPin && (
        <PinterestPreviewModal
          pin={previewPin}
          aspectRatio={aspectRatio}
          productImage={uploadedImage || ""}
          onClose={() => setPreviewPin(null)}
        />
      )}
    </div>
  );
}


// ─── Sub-components ────────────────────────────────────────────────────────────
function ImageUpload({ onImageUpload, imageUrl }: { onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void; imageUrl: string | null }) {
  return (
    <label className="flex flex-col items-center justify-center w-full min-h-[160px] bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2.5rem] cursor-pointer hover:bg-slate-100 transition-all text-slate-400 overflow-hidden relative group">
      {imageUrl ? (
        <>
          <img src={imageUrl} alt="Uploaded product" className="w-full h-full object-cover"/>
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white">
            <RefreshCw size={28} className="mb-2"/>
            <p className="text-xs font-black uppercase tracking-widest">Change Image</p>
          </div>
        </>
      ) : (
        <>
          <div className="w-16 h-16 bg-white rounded-2xl shadow-xl flex items-center justify-center mb-4 text-slate-300 group-hover:text-rose-500 group-hover:scale-110 transition-all"><Upload size={32} className="stroke-[2]"/></div>
          <p className="text-lg font-black text-slate-900 tracking-tight mb-1">Source Visual</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Upload your product photo</p>
        </>
      )}
      <input type="file" className="hidden" accept="image/*" onChange={onImageUpload}/>
    </label>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow text-center">
      <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-4">{icon}</div>
      <h3 className="font-bold text-slate-800 mb-2">{title}</h3>
      <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
    </div>
  );
}

function PricingCard({ tier, price, billing, generations, description, note, features, isPopular, tierKey, currentTier, onSelect, onRequestCheckout }: any) {
  const [loading, setLoading] = useState(false);

  function handleBuy() {
    if (tierKey === "free") { window.scrollTo({ top: 0, behavior: "smooth" }); return; } // free trial starts at the upload box
    const priceId = (PRICE_IDS as Record<string, string>)[tierKey];
    if (!priceId) { alert("Price not configured for this plan."); return; }
    // Open email modal in parent, passing priceId
    onRequestCheckout(priceId);
  }

  const isCurrent = currentTier === tierKey;
  const isFree = tierKey === "free";
  // Paid plans are always purchasable — credits stack on top of existing balance
  const isDisabled = loading;

  return (
    <div className={`relative rounded-3xl border-2 p-8 flex flex-col gap-6 min-h-[580px] w-full transition-all duration-300 hover:scale-[1.02] ${
      isPopular 
        ? "border-rose-500 shadow-2xl shadow-rose-200/50 bg-white md:-mt-4 md:mb-4" 
        : "border-slate-200 shadow-xl shadow-slate-200/50 bg-white"
    } ${isCurrent ? "ring-4 ring-emerald-400 ring-offset-2" : ""}`}>
      
      {isPopular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-rose-500 to-rose-600 text-white text-xs font-bold px-6 py-2.5 rounded-full shadow-lg uppercase tracking-wider">
          Most Popular
        </div>
      )}
      
      {/* Header */}
      <div className="text-center pt-2">
        <h3 className={`text-2xl font-black ${isPopular ? "text-rose-600" : "text-slate-800"}`}>
          {tier}
        </h3>
        <p className="text-sm text-slate-500 mt-2 font-medium">{description}</p>
      </div>
      
      {/* Price */}
      <div className="text-center py-6 border-y border-slate-100">
        <div className="flex items-baseline justify-center gap-1">
          <span className="text-5xl font-black text-slate-900">{price}</span>
          {!isFree && <span className="text-sm text-slate-400 font-medium">/{billing || "mo"}</span>}
        </div>
        <div className="mt-3 inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full text-sm font-bold">
          <Zap size={16} />
          {generations}
        </div>
      </div>

      {note && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold rounded-xl px-3 py-2.5 -mt-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{note}</span>
        </div>
      )}
      
      {/* Features */}
      <ul className="flex flex-col gap-3 flex-1">
        {features.map((f: string, i: number) => (
          <li key={i} className="flex items-start gap-3 text-sm text-slate-600">
            <Check size={18} className={`mt-0.5 shrink-0 ${isPopular ? "text-rose-500" : "text-emerald-500"}`} />
            <span className="font-medium">{f}</span>
          </li>
        ))}
      </ul>
      
      {/* CTA Button */}
      <button
        onClick={handleBuy}
        disabled={isDisabled}
        className={`w-full py-4 rounded-xl text-sm font-bold transition-all duration-200 ${
          isFree
            ? "bg-slate-100 text-slate-700 hover:bg-slate-200 border-2 border-slate-300"
            : isPopular
            ? "bg-gradient-to-r from-rose-500 to-rose-600 text-white hover:from-rose-600 hover:to-rose-700 shadow-lg shadow-rose-200"
            : "bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-200"
        }`}
      >
        {loading ? "Processing..." : isFree ? "Start Free Trial" : isCurrent ? "＋ Add More Credits" : "Subscribe"}
      </button>
    </div>
  );
}
