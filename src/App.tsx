/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * App 1 UI (PinMotionAI design) + Vercel backend API routing.
 * All AI calls go through /api/generate, /api/image.
 * No direct Gemini SDK usage — the backend handles keys and model selection.
 */

import { useState, useEffect, useRef } from "react";
import { toPng } from "html-to-image";
import {
  Sparkles, Copy, Check, Image as ImageIcon, Loader2, ArrowRight,
  Upload, Download, RefreshCw, Zap, Target, Search, ExternalLink,
  Eye, AlertCircle, Star, Palette, Plus, Hash, Accessibility,
  User, Crown
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { supabase } from "./supabase";

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

// ─── Backend API helpers ───────────────────────────────────────────────────────

/** All text/JSON AI calls → /api/generate (Vercel serverless, key lives server-side) */
async function geminiRest(
  prompt: string,
  opts: { jsonMode?: boolean; parts?: any[] } = {}
): Promise<string> {
  const res = await fetch("/api/generate", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt:   prompt || "",
      parts:    opts.parts  || null,
      jsonMode: opts.jsonMode || false,
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
  aiImagePrompt: string; videoPrompts: string[];
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

// ─── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [productName, setProductName]               = useState("");
  const [isLoading, setIsLoading]                     = useState(false);
  const [isGeneratingImage, setIsGeneratingImage]     = useState(false);
  const [isEnhancingSEO, setIsEnhancingSEO]           = useState(false);
  const [strategy, setStrategy]                       = useState<PinStrategy | null>(null);
  const [selectedAngleIndex, setSelectedAngleIndex] = useState<number | null>(null);
  const [overlayPosition, setOverlayPosition]         = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging]                   = useState(false);
  const [imgOffset, setImgOffset]                     = useState({ x: 0, y: 0 });
  const [imgScale, setImgScale]                       = useState(1);
  const [isImgDragging, setIsImgDragging]             = useState(false);
  const imgDragStart                                  = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);
  const lastPinchDist                                 = useRef<number | null>(null);
  const [editableHeadline, setEditableHeadline]       = useState("");
  const [editableSubtext, setEditableSubtext]         = useState("");
  const [editableCTA, setEditableCTA]                 = useState("");
  const [uploadedImage, setUploadedImage]             = useState<string | null>(null);
  const [generatedImage, setGeneratedImage]           = useState<string | null>(null);
  const [copiedField, setCopiedField]                 = useState<string | null>(null);
  const [error, setError]                             = useState<string | null>(null);
  const [cloningMode, setCloningMode]               = useState<"direct"|"stylized"|"reimagine"|"variation">("direct");
  const [aspectRatio, setAspectRatio]               = useState<"9:16"|"2:3">("9:16");
  const [overlayScale, setOverlayScale]             = useState(1);
  const [isAnalyzingImage, setIsAnalyzingImage]     = useState(false);
  const [socialProof, setSocialProof]               = useState<{ stars?: number; reviews?: string; sold?: string } | null>(null);
  const [productUrl, setProductUrl]                 = useState("");
  const [customVisualPrompt, setCustomVisualPrompt] = useState("");

  // ── NEW: User state and generation tracking ─────────────────────────────────
  const [userName, setUserName]                       = useState("");
  const [userEmail, setUserEmail]                     = useState("");
  const [userTier, setUserTier]                       = useState<"free" | "starter" | "pro" | "scale">("free");
  const [generationsUsed, setGenerationsUsed]         = useState(0);
  const [showUpgradeModal, setShowUpgradeModal]       = useState(false);

  const [showEmailModal, setShowEmailModal]           = useState(false);
  const [pendingPriceId, setPendingPriceId]           = useState<string | null>(null);
  const [emailInput, setEmailInput]                   = useState("");
  const [paymentSuccess, setPaymentSuccess]           = useState(false);
  const [isLoadingUser, setIsLoadingUser]             = useState(false);

  const TIER_LIMITS = { free: 3, starter: 50, pro: 200, scale: 999999 };
  const TIER_NAMES = { free: "Free Trial", starter: "Starter", pro: "Pro", scale: "Scale" };

  const generationsLeft = TIER_LIMITS[userTier] - generationsUsed;

  const previewRef = useRef<HTMLDivElement>(null);

  // ── Force canvas to exact aspect ratio height regardless of flex parent ───────
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const apply = () => {
      const w = el.offsetWidth;
      el.style.height = (aspectRatio === "9:16" ? (w * 3 / 2) : (w * 4 / 3)) + "px";
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspectRatio]);
  const CREATION_COSTS = { STRATEGY: 1, IMAGE: 1 };

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
      setGenerationsUsed(0);
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

    console.log("[mount] payment:", payment, "email:", email, "sessionId:", sessionId);

    if (payment === "success" && email) {
      setPaymentSuccess(true);
      setUserEmail(email);
      localStorage.setItem("pinviral_email", email);
      window.history.replaceState({}, "", "/");
      const priceId = params.get("price_id");
      console.log("[mount] priceId:", priceId);
      if (priceId) {
        activatePlan(email, priceId);
      } else {
        console.warn("[mount] No price_id in URL — falling back to Supabase");
        loadUserFromSupabase(email);
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
      setGenerationsUsed(user.images_total - user.images_left);
    } catch { /* non-fatal */ }
    finally { setIsLoadingUser(false); }
  };

  // Auto-fetch social proof when URL is entered
  useEffect(() => {
    const t = setTimeout(() => {
      if (productUrl.length > 8 && !isAnalyzingImage && !socialProof)
        analyzeUploadedImage(null, productUrl);
    }, 2000);
    return () => clearTimeout(t);
  }, [productUrl]);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const selectAngle = (i: number, angle: ViralAngle) => {
    setSelectedAngleIndex(i);
    setEditableHeadline(angle.headlines[0]);
    setEditableSubtext(angle.subtext[0]);
    setEditableCTA(angle.cta);
    setCustomVisualPrompt(angle.aiImagePrompt || "");
  };

  const resetApp = () => {
    setProductName(""); setProductUrl(""); setStrategy(null); setSelectedAngleIndex(null);
    setUploadedImage(null); setGeneratedImage(null);
    setSocialProof(null); setEditableHeadline(""); setEditableSubtext("");
    setEditableCTA(""); setCustomVisualPrompt(""); setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // ── Checkout with email ───────────────────────────────────────────────────────
  const handleProceedToCheckout = async () => {
    if (!emailInput.includes("@") || !pendingPriceId) return;
    setShowEmailModal(false);
    setUserEmail(emailInput);
    localStorage.setItem("pinviral_email", emailInput);
    try {
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId: pendingPriceId, email: emailInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.href = data.url;
    } catch (err: any) {
      alert("Payment failed: " + err.message);
    }
  };

  // ── Generate strategy ────────────────────────────────────────────────────────
  const generateStrategy = async () => {
    if (!productName.trim()) return;
    if (generationsLeft < CREATION_COSTS.STRATEGY) {
      setError(`No generations left. You have used ${generationsUsed}/${TIER_LIMITS[userTier]}. Upgrade to continue.`);
      setShowUpgradeModal(true);
      return;
    }
    setIsLoading(true); setError(null);
    setGeneratedImage(null); setSocialProof(null); setCustomVisualPrompt("");
    try {
      const prompt = `You are a Pinterest viral growth expert + e-commerce strategist.
Create 5 high-converting Pinterest pin strategies for: "${productName}".
Visual vibe: Professional, Aesthetic, Lifestyle-focused.
Target: impulse buyers, home decor, lifestyle, problem-solving audiences.

For each angle provide:
1. title (angle name)
2. seoTitle (High-CTR pin title, e.g. "Why Every Home Needs This")
3. hook (1-line attention grabber)
4. psychology (emotional trigger explanation)
5. aiImagePrompt (50-80 word descriptive scene. CRITICAL: The ENTIRE product must be fully visible in the frame — no cropping, no cutting off edges, full product shown from top to bottom with generous padding around it. Product centered, floating or on surface, complete product visible.)
6. headlines (exactly 5 punchy variants)
7. subtext (exactly 3 social-proof lines)
8. cta
9. pinDescription (100+ word SEO-optimised paragraph with keywords)
10. hashtags (exactly 10 relevant tags)
11. altText (accessibility description of the pin image)
12. videoPrompts (exactly 5 scene scripts for 15-30s video)

NEGATIVE CONSTRAINTS: No generic phrases like "Shop for Trend", "Unlock Your Potential", "Elevate Your Style", "Buy Now".
Return ONLY valid JSON, no markdown fences, no explanation:
{"angles":[{"title":"","seoTitle":"","hook":"","psychology":"","aiImagePrompt":"","headlines":["","","","",""],"subtext":["","",""],"cta":"","pinDescription":"","hashtags":["","","","","","","","","",""],"altText":"","videoPrompts":["","","","",""]}]}`;

      const text = await withRetry(() => geminiRest(prompt, { jsonMode: true }));
      const data = extractAndParseJSON(text) as PinStrategy;
      if (!data.angles?.length) throw new Error("No angles returned. Please try again.");
      setStrategy(data);
      selectAngle(0, data.angles[0]);
      setGenerationsUsed(p => p + CREATION_COSTS.STRATEGY);
    } catch (err: any) {
      const msg = err.message || "";
      setError(
        msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED")
          ? "Rate limit -- please wait 15 seconds and try again."
          : msg || "Failed to generate strategy. Please try again."
      );
    } finally { setIsLoading(false); }
  };

  // ── Generate image → /api/image ──────────────────────────────────────────────
  const generateImage = async (currentStrategy?: PinStrategy) => {
    const active = currentStrategy || strategy;
    if (!active || selectedAngleIndex === null) return;

    if (generationsLeft < CREATION_COSTS.IMAGE) {
      setError(`No generations left. You have used ${generationsUsed}/${TIER_LIMITS[userTier]}. Upgrade to continue.`);
      setShowUpgradeModal(true);
      return;
    }

    setIsGeneratingImage(true); setError(null);
    try {
      const base = active.angles[selectedAngleIndex]?.aiImagePrompt || "";
      const CLONING = {
        direct:    "[IDENTICAL CLONE] Product shape, logo, color, branding 100% identical. Premium setting.",
        stylized:  "[STYLIZED] Core product identity maintained, artistic/editorial environment.",
        reimagine: "[REIMAGINE] Product as central element in a completely new conceptual context.",
        variation: "[VARIATION] Subtle changes: new colorway or material finish.",
      };
      const finalPrompt =
        `${CLONING[cloningMode]} Environment: ${customVisualPrompt || base}. ` +
        `CRITICAL COMPOSITION RULE: Show the COMPLETE product in full — entire product visible from top to bottom, no cropping, no partial cuts, full object with clear space/padding around all edges. Product must be 100% fully visible in frame. ` +
        `Professional Pinterest product photography. Sharp focus, beautiful bokeh, lifestyle aesthetic. Wide enough shot to show entire product.`;

      const payload: any = { prompt: finalPrompt };
      if (uploadedImage?.startsWith("data:")) {
        payload.imageB64  = uploadedImage.split(",")[1];
        payload.imageMime = uploadedImage.split(";")[0].split(":")[1];
      }
      const res  = await fetch("/api/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Image generation failed");
      if (!data.imageB64) throw new Error("No image returned. Please try again.");

      setGeneratedImage(`data:image/png;base64,${data.imageB64}`);
      setImgOffset({ x: 0, y: 0 });
      setImgScale(1);
      setGenerationsUsed(p => p + CREATION_COSTS.IMAGE);
    } catch (err: any) { setError(err.message || "Failed to generate image."); }
    finally { setIsGeneratingImage(false); }
  };

  // ── Analyze image / URL for social proof ────────────────────────────────────
  const analyzeUploadedImage = async (imageData: string | null, url?: string) => {
    if (!imageData && !url) return;
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
{"hasSocialProof":boolean,"stars":number|null,"reviews":string|null,"sold":string|null,"suggestedHeadline":string,"suggestedSubtext":string}
No generic CTAs. Focus on social proof and value proposition.` });

      const raw    = await geminiRest("", { jsonMode: true, parts }).catch(() => "{}");
      const result = extractAndParseJSON(raw);
      if (result.hasSocialProof) {
        setSocialProof({ stars: result.stars, reviews: result.reviews, sold: result.sold });
        if (result.suggestedHeadline) setEditableHeadline(result.suggestedHeadline);
        if (result.suggestedSubtext)  setEditableSubtext(result.suggestedSubtext);
      }
    } catch { /* non-fatal */ }
    finally { setIsAnalyzingImage(false); }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const d = reader.result as string;
      setUploadedImage(d);
      analyzeUploadedImage(d, productUrl);
    };
    reader.readAsDataURL(file);
  };

  // ── Enhance SEO description ──────────────────────────────────────────────────
  const enhanceSEO = async () => {
    if (!strategy || selectedAngleIndex === null) return;
    setIsEnhancingSEO(true);
    try {
      const angle  = strategy.angles[selectedAngleIndex];
      const text   = await withRetry(() => geminiRest(
        `Pinterest SEO expert. Enhance this pin description for "${productName}" with more high-performing keywords and long-tail search terms.\nCurrent: "${angle.pinDescription}"\nReturn ONLY the new description text.`
      ));
      if (text) {
        const angles = [...strategy.angles];
        angles[selectedAngleIndex] = { ...angle, pinDescription: text.trim() };
        setStrategy({ ...strategy, angles });
      }
    } catch { /* non-fatal */ }
    finally { setIsEnhancingSEO(false); }
  };

  // ── Download helpers ─────────────────────────────────────────────────────────
  const downloadImage = async () => {
    if (!previewRef.current) return;
    try {
      // Exact Pinterest dimensions: 1000x1500 (9:16) or 1000x1500 (2:3 = 1000x1333)
      const W = 1000;
      const H = aspectRatio === "9:16" ? 1500 : 1333;

      // Measure the rendered element on screen
      const rect = previewRef.current.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;

      const url = await toPng(previewRef.current, {
        cacheBust: true,
        pixelRatio: Math.max(scaleX, scaleY),
        canvasWidth:  W,
        canvasHeight: H,
        style: {
          borderRadius: "0",
          boxShadow: "none",
          margin: "0",
          width:  rect.width  + "px",
          height: rect.height + "px",
        },
      });

      const link = Object.assign(document.createElement("a"), {
        href: url,
        download: `pinterest-pin-${aspectRatio.replace(":","-")}-${productName.replace(/\s+/g,"-").toLowerCase()||"design"}.png`,
      });
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Download error:", err);
      setError("Download failed. Right-click the image and select 'Save Image As'.");
    }
  };

  // ── Drag handlers for text overlay ──────────────────────────────────────────
  const handleDragStart = () => setIsDragging(true);
  const handleDragEnd   = () => setIsDragging(false);
  const handleDrag = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const cx = "touches" in e ? e.touches[0].clientX : e.clientX;
    const cy = "touches" in e ? e.touches[0].clientY : e.clientY;
    setOverlayPosition({
      x: Math.max(-40, Math.min(40, ((cx - rect.left) / rect.width)  * 100 - 50)),
      y: Math.max(-40, Math.min(40, ((cy - rect.top)  / rect.height) * 100 - 50)),
    });
  };

  // ── Drag/pinch handlers for background image ────────────────────────────────
  const handleImgMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    imgDragStart.current = { mx: e.clientX, my: e.clientY, ox: imgOffset.x, oy: imgOffset.y };
    setIsImgDragging(true);
  };
  const handleImgMouseMove = (e: React.MouseEvent) => {
    if (!imgDragStart.current) return;
    setImgOffset({
      x: imgDragStart.current.ox + (e.clientX - imgDragStart.current.mx),
      y: imgDragStart.current.oy + (e.clientY - imgDragStart.current.my),
    });
  };
  const handleImgMouseUp = () => { imgDragStart.current = null; setIsImgDragging(false); };

  const handleImgTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      imgDragStart.current = { mx: e.touches[0].clientX, my: e.touches[0].clientY, ox: imgOffset.x, oy: imgOffset.y };
      lastPinchDist.current = null;
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist.current = Math.hypot(dx, dy);
      imgDragStart.current = null;
    }
  };
  const handleImgTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1 && imgDragStart.current) {
      setImgOffset({
        x: imgDragStart.current.ox + (e.touches[0].clientX - imgDragStart.current.mx),
        y: imgDragStart.current.oy + (e.touches[0].clientY - imgDragStart.current.my),
      });
    } else if (e.touches.length === 2 && lastPinchDist.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / lastPinchDist.current;
      setImgScale(s => Math.min(4, Math.max(0.3, s * ratio)));
      lastPinchDist.current = dist;
    }
  };
  const handleImgTouchEnd = () => { imgDragStart.current = null; lastPinchDist.current = null; };

  const handleImgWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    setImgScale(s => Math.min(4, Math.max(0.3, s * delta)));
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
                : `🎉 Activated! Welcome to ${TIER_NAMES[userTier]} — ${TIER_LIMITS[userTier]} generations ready for ${userEmail}`}
            </span>
            <button onClick={() => setPaymentSuccess(false)} className="ml-4 text-white/80 hover:text-white text-lg leading-none">×</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Email Modal (shown before checkout) ─────────────────────────────── */}
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
                <h3 className="text-2xl font-black text-slate-900 mb-2">Enter Your Email</h3>
                <p className="text-slate-500 text-sm font-medium">We'll use this to activate your credits after payment.</p>
              </div>
              <input
                type="email"
                placeholder="you@example.com"
                className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-rose-500 outline-none text-slate-700 font-bold mb-4"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleProceedToCheckout()}
                autoFocus
              />
              <button
                onClick={handleProceedToCheckout}
                disabled={!emailInput.includes("@")}
                className="w-full py-4 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:cursor-not-allowed text-white font-black rounded-2xl transition-all">
                Continue to Payment →
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
          <div className="flex items-center gap-4">
            {/* Generation counter badge */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-xl">
              <Zap size={14} className={generationsLeft <= 3 ? "text-rose-500" : "text-emerald-500"}/>
              <span className="text-[10px] font-black uppercase tracking-widest">
                {generationsUsed}/{TIER_LIMITS[userTier]} Used
              </span>
              <span className={cn("text-[10px] font-black px-1.5 py-0.5 rounded-md",
                generationsLeft <= 3 ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600")}>
                {generationsLeft} Left
              </span>
            </div>
            {strategy && (
              <button onClick={resetApp} className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition-all">
                <RefreshCw size={14}/> Next Product
              </button>
            )}
            <button onClick={() => setShowUpgradeModal(true)}
              className="hidden sm:flex px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl shadow-lg shadow-rose-100 uppercase tracking-widest transition-all items-center gap-2">
              <Crown size={14}/> Upgrade
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 lg:py-12">

        {/* ── User info bar (auto-generated) ─────────────────────────── */}
        {!strategy && (
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
                    {generationsUsed}/{TIER_LIMITS[userTier]} Used
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

        {/* ── Input zone ─────────────────────────────────────────────────────── */}
        <section className={cn("transition-all duration-700 max-w-4xl mx-auto", strategy ? "mb-8 opacity-40 scale-95 pointer-events-none" : "mb-16")}>
          <div className="text-center mb-10">
            <h4 className="text-rose-600 font-black uppercase tracking-[0.3em] text-[10px] mb-2">What Are You Selling Today?</h4>
            <h2 className="text-4xl sm:text-5xl font-black text-slate-900 mb-4 tracking-tighter">
              {strategy ? "Strategy Ready" : "Start Your Viral Campaign"}
            </h2>
            <p className="text-slate-500 text-lg font-medium">
              Upload product photo. Generate 5 professional angles. <span className="text-rose-600 italic">Go Viral.</span>
            </p>
          </div>

          <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-100 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">1. Product Name</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400"><Target size={20}/></div>
                    <input type="text" placeholder="e.g. Minimalist Ceramic Vase"
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-rose-500 outline-none transition-all text-slate-700 font-bold"
                      value={productName} onChange={e => setProductName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && generateStrategy()}/>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">2. Social Proof URL <span className="text-slate-300 normal-case font-medium">(optional)</span></label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400"><ExternalLink size={20}/></div>
                    <input type="text" placeholder="Paste store URL for reviews"
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-rose-500 outline-none transition-all text-slate-700 font-bold"
                      value={productUrl} onChange={e => setProductUrl(e.target.value)}/>
                  </div>
                  {isAnalyzingImage && (
                    <p className="text-[10px] text-violet-500 font-bold ml-1 flex items-center gap-1 animate-pulse">
                      <Loader2 size={9} className="animate-spin"/> Fetching social proof...
                    </p>
                  )}
                  {socialProof?.stars && (
                    <p className="text-[10px] text-emerald-600 font-bold ml-1 flex items-center gap-1">
                      <Check size={9}/> Found: {socialProof.stars}* · {socialProof.reviews}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">3. Product Image</label>
                <ImageUpload onImageUpload={handleImageUpload} imageUrl={uploadedImage}/>
              </div>
            </div>

            {/* Generation usage label */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-2">
                <Zap size={14} className={generationsLeft <= 3 ? "text-rose-500" : "text-emerald-500"}/>
                <span className="text-[11px] font-bold text-slate-600">
                  Generation Usage: <span className="text-slate-900">{generationsUsed}</span> / {TIER_LIMITS[userTier]}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("text-[10px] font-black px-2 py-1 rounded-lg",
                  generationsLeft <= 3 ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600")}>
                  {generationsLeft} Left
                </span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {TIER_NAMES[userTier]}
                </span>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-3 p-4 bg-rose-50 border border-rose-100 rounded-2xl">
                <AlertCircle size={15} className="text-rose-500 mt-0.5 shrink-0"/>
                <p className="text-xs font-bold text-rose-700 flex-1">{error}</p>
                <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600 text-lg leading-none">×</button>
              </div>
            )}

            {!strategy && (
              <button onClick={generateStrategy} disabled={isLoading || !productName.trim() || !uploadedImage}
                className="w-full py-5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:cursor-not-allowed text-white font-black text-xl rounded-2xl shadow-xl shadow-rose-100 transition-all flex items-center justify-center gap-3 active:scale-[0.98]">
                {isLoading ? <Loader2 className="animate-spin" size={24}/> : <><Zap size={24}/> Output 5 Viral Angles &amp; SEO</>}
              </button>
            )}
          </div>
        </section>

        {/* ── Strategy workspace ─────────────────────────────────────────────── */}
        {strategy && (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* Left panel */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-100 space-y-6 sticky top-24">

                {/* Generation usage indicator in workspace */}
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex items-center gap-2">
                    <Zap size={14} className={generationsLeft <= 3 ? "text-rose-500" : "text-emerald-500"}/>
                    <span className="text-[11px] font-bold text-slate-600">
                      Used: <span className="text-slate-900">{generationsUsed}</span> / {TIER_LIMITS[userTier]}
                    </span>
                  </div>
                  <button onClick={() => setShowUpgradeModal(true)}
                    className="text-[10px] font-black text-rose-600 hover:text-rose-700 uppercase tracking-widest flex items-center gap-1">
                    <Crown size={12}/> Upgrade
                  </button>
                </div>

                {/* Angle selector */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Strategy Angle</label>
                      <p className="text-[9px] text-rose-500 font-bold italic">Swapping angles is free &amp; instant</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Angle number pills */}
                      <div className="flex gap-1.5">
                        {[0,1,2,3,4].map(i => (
                          <button key={i} onClick={() => selectAngle(i, strategy.angles[i])}
                            className={cn("w-8 h-8 rounded-full border-2 font-black text-xs transition-all flex items-center justify-center",
                              selectedAngleIndex === i ? "bg-rose-600 border-rose-600 text-white scale-110 shadow-lg" : "bg-white border-slate-100 text-slate-300 hover:border-rose-300 hover:text-rose-600")}>
                            {i + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {selectedAngleIndex !== null && (
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-black text-slate-900 text-sm tracking-tight">{strategy.angles[selectedAngleIndex].title}</h4>
                        <button onClick={() => copyToClipboard(strategy.angles[selectedAngleIndex].title, "title")} className="text-slate-300 hover:text-rose-600 transition-colors">
                          {copiedField === "title" ? <Check size={14} className="text-emerald-500"/> : <Copy size={14}/>}
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed font-medium italic">
                        "{strategy.angles[selectedAngleIndex].psychology}"
                      </p>
                    </div>
                  )}
                </div>

                {/* SEO assets */}
                {selectedAngleIndex !== null && (
                  <div className="space-y-8 pt-6 border-t border-slate-100">

                    {/* SEO Title */}
                    <div className="flex gap-4">
                      <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center shrink-0 mt-1"><Target size={20} className="text-rose-600"/></div>
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center justify-between">
                          <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Pinterest Title</h5>
                          <button onClick={() => copyToClipboard(strategy.angles[selectedAngleIndex].seoTitle || strategy.angles[selectedAngleIndex].title, "seoTitle")}
                            className="p-1 hover:bg-slate-50 rounded-lg text-slate-300 hover:text-rose-600 transition-all">
                            {copiedField === "seoTitle" ? <Check size={14} className="text-emerald-500"/> : <Copy size={14}/>}
                          </button>
                        </div>
                        <p className="text-sm font-black text-slate-900 leading-tight">
                          {strategy.angles[selectedAngleIndex].seoTitle || strategy.angles[selectedAngleIndex].title}
                        </p>
                      </div>
                    </div>

                    {/* SEO Description */}
                    <div className="flex gap-4">
                      <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0 mt-1"><Search size={20} className="text-indigo-600"/></div>
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center justify-between">
                          <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Pinterest Description</h5>
                          <div className="flex items-center gap-1">
                            <button onClick={enhanceSEO} disabled={isEnhancingSEO} title="Enhance SEO with AI"
                              className="p-1 hover:bg-slate-50 rounded-lg text-violet-400 hover:text-violet-600 disabled:opacity-50 transition-all">
                              {isEnhancingSEO ? <Loader2 size={13} className="animate-spin"/> : <Zap size={13}/>}
                            </button>
                            <button onClick={() => copyToClipboard(strategy.angles[selectedAngleIndex].pinDescription, "desc")}
                              className="p-1 hover:bg-slate-50 rounded-lg text-slate-300 hover:text-rose-600 transition-all">
                              {copiedField === "desc" ? <Check size={14} className="text-emerald-500"/> : <Copy size={14}/>}
                            </button>
                          </div>
                        </div>
                        <div className="max-h-28 overflow-y-auto pr-1">
                          <p className="text-xs text-slate-600 font-medium leading-relaxed">{strategy.angles[selectedAngleIndex].pinDescription}</p>
                        </div>
                      </div>
                    </div>

                    {/* Alt Text */}
                    <div className="flex gap-4">
                      <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center shrink-0 mt-1"><Accessibility size={20} className="text-amber-600"/></div>
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center justify-between">
                          <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Alt Text</h5>
                          <button onClick={() => copyToClipboard(strategy.angles[selectedAngleIndex].altText || "", "altText")}
                            className="p-1 hover:bg-slate-50 rounded-lg text-slate-300 hover:text-rose-600 transition-all">
                            {copiedField === "altText" ? <Check size={14} className="text-emerald-500"/> : <Copy size={14}/>}
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-400 font-medium italic">
                          {strategy.angles[selectedAngleIndex].altText || "Professional product visualization for lifestyle context."}
                        </p>
                      </div>
                    </div>

                    {/* Hashtags */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Hash size={10}/>Viral Tags</label>
                        <button onClick={() => copyToClipboard(strategy.angles[selectedAngleIndex].hashtags.join(" "), "tags")}
                          className="text-slate-300 hover:text-rose-600 transition-colors">
                          {copiedField === "tags" ? <Check size={14} className="text-emerald-500"/> : <Copy size={14}/>}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {strategy.angles[selectedAngleIndex].hashtags.map((tag, i) => (
                          <span key={i} className="px-2.5 py-1 bg-white border border-slate-100 rounded-lg text-[9px] font-black text-slate-400 uppercase tracking-tight">{tag}</span>
                        ))}
                      </div>
                    </div>

                    {/* Editable overlay fields */}
                    <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-6">
                      <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Headline Override</label>
                        <input type="text" value={editableHeadline} onChange={e => setEditableHeadline(e.target.value)}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-rose-500 outline-none transition-all"/>
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Subtext / Social Proof</label>
                        <input type="text" value={editableSubtext} onChange={e => setEditableSubtext(e.target.value)}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-rose-500 outline-none transition-all"/>
                      </div>
                    </div>
                  </div>
                )}

                {/* Visual controls */}
                <div className="space-y-6 pt-6 border-t border-slate-100">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Visual Customizer</label>

                  {/* Aspect ratio */}
                  <div className="grid grid-cols-2 gap-2">
                    {[{ id:"9:16", label:"9:16 vertical" },{ id:"2:3", label:"2:3 classic" }].map(r => (
                      <button key={r.id} onClick={() => setAspectRatio(r.id as any)}
                        className={cn("py-2.5 rounded-xl border-2 text-[10px] font-black uppercase transition-all tracking-widest",
                          aspectRatio === r.id ? "bg-slate-900 border-slate-900 text-white" : "bg-white border-slate-50 text-slate-300")}>
                        {r.label}
                      </button>
                    ))}
                  </div>

                  {/* Scene environment auto-derived from selected angle */}
                  {selectedAngleIndex !== null && strategy?.angles[selectedAngleIndex]?.aiImagePrompt && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Scene Environment</label>
                      <div className="px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                        <p className="text-[10px] font-bold text-slate-500 leading-relaxed">
                          {strategy.angles[selectedAngleIndex].aiImagePrompt}
                        </p>
                      </div>
                      <p className="text-[9px] text-slate-300 font-bold italic ml-1">Auto-set from selected angle · 100% product identity preserved</p>
                    </div>
                  )}

                  <button onClick={() => generateImage()} disabled={isGeneratingImage}
                    className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white font-black text-sm rounded-2xl shadow-xl shadow-rose-100 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-60">
                    {isGeneratingImage ? <Loader2 className="animate-spin" size={18}/> : <Sparkles size={18}/>}
                    Regenerate Visual Identity
                  </button>
                  <p className="text-[9px] text-slate-400 text-center font-bold italic">
                    Uses 1 generation · {generationsLeft} remaining · Matches selected angle
                  </p>
                </div>

                <button onClick={resetApp}
                  className="w-full py-3 text-[10px] font-black text-slate-300 hover:text-rose-500 uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2">
                  <Plus size={14}/> New Campaign
                </button>
              </div>
            </div>

            {/* Right: main visual workspace */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-white p-6 sm:p-10 rounded-[3.5rem] border border-slate-200 shadow-2xl shadow-slate-200/50 flex flex-col">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center border border-slate-100">
                      {isGeneratingImage ? <Loader2 className="animate-spin text-rose-600" size={18}/> : <Eye size={18} className="text-slate-400"/>}
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-900 tracking-tight">Identity Locked Pin</h3>
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mt-0.5">Final Creative Output</p>
                    </div>
                  </div>
                  <button onClick={downloadImage} className="p-3 bg-slate-50 hover:bg-rose-50 rounded-2xl text-slate-400 hover:text-rose-600 transition-all shadow-sm active:scale-90">
                    <Download size={20}/>
                  </button>
                </div>

                {/* Pin canvas */}
                <div ref={previewRef}
                  style={{ aspectRatio: aspectRatio === "9:16" ? "2/3" : "3/4", maxWidth: aspectRatio === "9:16" ? "360px" : "400px" }}
                  className="bg-slate-100 rounded-[3.5rem] overflow-hidden relative cursor-crosshair touch-none mx-auto w-full transition-all duration-700 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] flex-shrink-0 self-start"
                  onMouseMove={handleDrag} onTouchMove={handleDrag}
                  onMouseUp={handleDragEnd} onTouchEnd={handleDragEnd}>

                  {isGeneratingImage ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 backdrop-blur-xl z-30">
                      <div className="relative w-24 h-24 mb-6">
                        <div className="absolute inset-0 border-8 border-rose-100 rounded-full"/>
                        <div className="absolute inset-0 border-8 border-rose-600 rounded-full border-t-transparent animate-spin"/>
                        <div className="absolute inset-0 flex items-center justify-center"><Target size={32} className="text-rose-600 animate-pulse"/></div>
                      </div>
                      <p className="font-black text-slate-900 text-xl tracking-tight">Generating...</p>
                      <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-[0.3em]">Identity Preservation 100%</p>
                    </div>
                  ) : (
                    <>
                      {(generatedImage || uploadedImage) && (
                        <div
                          className="absolute inset-0 overflow-hidden"
                          style={{ cursor: isImgDragging ? "grabbing" : "grab" }}
                          onMouseDown={handleImgMouseDown}
                          onMouseMove={handleImgMouseMove}
                          onMouseUp={handleImgMouseUp}
                          onMouseLeave={handleImgMouseUp}
                          onTouchStart={handleImgTouchStart}
                          onTouchMove={handleImgTouchMove}
                          onTouchEnd={handleImgTouchEnd}
                          onWheel={handleImgWheel}>
                          <img src={generatedImage || uploadedImage || ""} alt="Pin Design"
                            className="absolute select-none pointer-events-none"
                            style={{
                              display: "block",
                              width: "100%", height: "100%",
                              objectFit: "cover",
                              transform: `translate(${imgOffset.x}px, ${imgOffset.y}px) scale(${imgScale})`,
                              transformOrigin: "center center",
                            }}
                            referrerPolicy="no-referrer" draggable={false}/>
                          {/* Drag hint shown briefly */}
                          {(imgScale === 1 && imgOffset.x === 0 && imgOffset.y === 0) && (
                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/40 text-white text-[8px] font-bold px-2 py-1 rounded-full pointer-events-none uppercase tracking-widest opacity-60">
                              drag · scroll to zoom
                            </div>
                          )}
                        </div>
                      )}

                      {/* Draggable text overlay */}
                      <div className="absolute inset-0 p-10 flex flex-col justify-center items-center pointer-events-none"
                        style={{ transform: `translate(${overlayPosition.x}%, ${overlayPosition.y}%) scale(${overlayScale})` }}>
                        <div className="w-full pointer-events-auto cursor-move select-none active:scale-95 transition-transform"
                          onMouseDown={handleDragStart} onTouchStart={handleDragStart}>
                          <div className="space-y-4 text-center">
                            <motion.div key={editableHeadline} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="px-6">
                              <h2 className="text-white font-black text-3xl sm:text-5xl uppercase italic tracking-tighter leading-[0.8] [text-shadow:_0_10px_40px_rgb(0_0_0_/_95%),_0_4px_10px_rgb(0_0_0_/_60%)] mb-3">
                                {editableHeadline.split(" ").map((word, i) => (
                                  <span key={i} className={i % 3 === 0 ? "text-rose-500" : ""}>{word}{" "}</span>
                                ))}
                              </h2>
                            </motion.div>
                            <p className="text-white text-[10px] sm:text-[11px] font-black leading-tight px-12 [text-shadow:_0_4px_12px_rgb(0_0_0_/_95%)] mb-8 uppercase tracking-[0.2em] opacity-90 italic">
                              {editableSubtext}
                            </p>
                            <div className="flex flex-wrap justify-center gap-2 mb-10">
                              <div className="bg-white/10 backdrop-blur-xl border border-white/20 px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 scale-110">
                                <div className="flex -space-x-1">
                                  {[0,1,2].map(i => (
                                    <div key={i} className="w-5 h-5 rounded-full bg-rose-500 border-2 border-white flex items-center justify-center overflow-hidden">
                                      <Star size={8} fill="white" className="text-white"/>
                                    </div>
                                  ))}
                                </div>
                                <span className="text-[10px] font-black text-white tracking-widest uppercase">
                                  {socialProof?.stars || "4.9"} · {socialProof?.reviews || "850"} REVIEWS
                                </span>
                              </div>
                            </div>
                            <div className="inline-flex px-12 py-5 bg-rose-600 text-white text-[10px] font-black rounded-full uppercase tracking-[0.4em] shadow-[0_25px_50px_rgba(225,29,72,0.6)]">
                              {editableCTA}
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* ── Text Overlay Size slider — below preview ── */}
                <div className="mt-4 px-1 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Text Overlay Size</span>
                    <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">{Math.round(overlayScale * 100)}%</span>
                  </div>
                  <input type="range" min="0.4" max="1.6" step="0.01" value={overlayScale}
                    onChange={e => setOverlayScale(parseFloat(e.target.value))}
                    className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-rose-600"/>
                  <div className="flex justify-between text-[9px] text-slate-300 font-bold">
                    <span>Small</span><span>Default</span><span>Large</span>
                  </div>
                </div>

                {/* ── Image Zoom + Reset ── */}
                {(generatedImage || uploadedImage) && (
                  <div className="mt-3 px-1 space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Image Zoom</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">{Math.round(imgScale * 100)}%</span>
                        <button onClick={() => { setImgScale(1); setImgOffset({ x: 0, y: 0 }); }}
                          className="text-[9px] font-black text-slate-400 hover:text-rose-600 uppercase tracking-widest transition-colors">
                          Reset
                        </button>
                      </div>
                    </div>
                    <input type="range" min="0.3" max="3" step="0.01" value={imgScale}
                      onChange={e => setImgScale(parseFloat(e.target.value))}
                      className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-rose-600"/>
                    <div className="flex justify-between text-[9px] text-slate-300 font-bold">
                      <span>Shrink</span><span className="italic">Drag image to reposition</span><span>Expand</span>
                    </div>
                  </div>
                )}

                {/* Headline / subtext variants — moved above Pinterest */}
                {selectedAngleIndex !== null && (
                  <div className="mt-4 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Title Variants</label>
                        <span className="text-[9px] font-black text-rose-500">Pick to swap</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {strategy.angles[selectedAngleIndex].headlines.map((h, i) => (
                          <button key={i} onClick={() => setEditableHeadline(h)}
                            className={cn("px-3 py-2.5 text-[10px] font-black rounded-xl border-2 transition-all uppercase tracking-tighter",
                              editableHeadline === h ? "bg-rose-600 border-rose-600 text-white shadow-lg" : "bg-white border-slate-100 text-slate-400 hover:border-slate-200")}>
                            Var {i + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Social Proof Line</label>
                      <div className="flex flex-wrap gap-2">
                        {strategy.angles[selectedAngleIndex].subtext.map((s, i) => (
                          <button key={i} onClick={() => setEditableSubtext(s)}
                            className={cn("px-3 py-2.5 text-[10px] font-black rounded-xl border-2 transition-all uppercase tracking-tighter",
                              editableSubtext === s ? "bg-slate-900 border-slate-900 text-white shadow-lg" : "bg-white border-slate-100 text-slate-400 hover:border-slate-200")}>
                            Proof {i + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Pinterest link + Generate This Video section ── */}
                {selectedAngleIndex !== null && (
                  <div className="mt-4 space-y-3">

                    {/* Pinterest — plain direct link */}
                    <a href="https://pinterest.com" target="_blank" rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 py-3 bg-[#E60023] hover:bg-[#c0001d] text-white font-black text-[11px] rounded-2xl uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-red-100">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/></svg>
                      Open Pinterest
                    </a>

                    {/* Generate This Video section */}
                    <div className="border border-slate-100 rounded-2xl p-4 space-y-3 bg-slate-50/50">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[8px] font-black bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full uppercase tracking-widest">Recommended AI Stack</span>
                        </div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Viral Content Creation Engines</p>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {/* Vid AI card */}
                        <div className="bg-white rounded-xl border border-slate-100 p-3 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-black text-slate-900">Vid AI</span>
                            <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                            </div>
                          </div>
                          <p className="text-[8px] font-black text-indigo-500 uppercase tracking-widest">Video Generation</p>
                          <p className="text-[9px] text-slate-400 font-medium leading-tight">Turn your viral prompt into high-retention clips for TikTok & Reels.</p>
                        </div>
                        {/* Submagic card */}
                        <div className="bg-white rounded-xl border border-slate-100 p-3 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-black text-slate-900">Submagic</span>
                            <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                            </div>
                          </div>
                          <p className="text-[8px] font-black text-indigo-500 uppercase tracking-widest">Caption Architect</p>
                          <p className="text-[9px] text-slate-400 font-medium leading-tight">Add viral captions, b-roll & sound effects automatically.</p>
                        </div>
                      </div>

                      <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Export & Start Generating</p>
                      <div className="grid grid-cols-1 gap-2">
                        <button
                          onClick={() => {
                            const prompt = strategy.angles[selectedAngleIndex]?.aiImagePrompt || editableHeadline || productName;
                            navigator.clipboard.writeText(prompt);
                            window.open("https://vid.ai/?ref=wong44", "_blank");
                          }}
                          className="w-full py-3 bg-slate-900 hover:bg-slate-700 text-white font-black text-[9px] rounded-xl uppercase tracking-widest transition-all active:scale-95">
                          Copy Prompt &amp; Open Vid AI
                        </button>
                        <button
                          onClick={() => {
                            const script = strategy.angles[selectedAngleIndex]?.pinDescription || editableSubtext || productName;
                            navigator.clipboard.writeText(script);
                            window.open("https://submagic.co/?via=wong86", "_blank");
                          }}
                          className="w-full py-3 bg-white hover:bg-slate-50 text-slate-900 font-black text-[9px] rounded-xl border-2 border-slate-200 uppercase tracking-widest transition-all active:scale-95">
                          Copy Script &amp; Open Submagic
                        </button>
                      </div>
                    </div>
                  </div>
                )}


                {error && (
                  <div className="mt-6 flex items-start gap-3 p-4 bg-rose-50 border border-rose-100 rounded-2xl">
                    <AlertCircle size={15} className="text-rose-500 mt-0.5 shrink-0"/>
                    <p className="text-xs font-bold text-rose-700 flex-1">{error}</p>
                    <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600 text-lg leading-none">×</button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Empty state */}
        {!strategy && !isLoading && (
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
                Pay once, generate forever. No subscriptions, no hidden fees.
              </p>
              <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full text-sm font-bold mt-4">
                <Check size={16} />
                One-time purchase — credits never expire
              </div>
            </div>

            {/* Pricing Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto items-stretch">
              <PricingCard 
                tier="Free Trial" 
                price="$0" 
                generations="3 generations"
                description="Perfect for testing the platform"
                features={[
                  "3 AI generations",
                  "5 viral angles per product",
                  "SEO descriptions & hashtags",
                  "Basic image export",
                  "Community support"
                ]} 
                tierKey="free" 
                currentTier={userTier} 
                onSelect={setUserTier}
                onRequestCheckout={(priceId: string) => { setPendingPriceId(priceId); setShowEmailModal(true); }}
              />
              <PricingCard 
                tier="Starter" 
                price="$24" 
                generations="50 generations"
                description="For creators getting started"
                features={[
                  "50 AI generations",
                  "All viral strategy features",
                  "AI image generation",
                  "Social proof detection",
                  "HD image export",
                  "Email support"
                ]} 
                tierKey="starter" 
                currentTier={userTier} 
                onSelect={setUserTier}
                onRequestCheckout={(priceId: string) => { setPendingPriceId(priceId); setShowEmailModal(true); }}
              />
              <PricingCard 
                tier="Pro" 
                price="$49" 
                generations="200 generations"
                description="For power sellers & agencies"
                features={[
                  "200 AI generations",
                  "Everything in Starter",
                  "Priority processing",
                  "Advanced cloning modes",
                  "4K image export",
                  "Priority support",
                  "Video storyboard generation"
                ]} 
                isPopular
                tierKey="pro" 
                currentTier={userTier} 
                onSelect={setUserTier}
                onRequestCheckout={(priceId: string) => { setPendingPriceId(priceId); setShowEmailModal(true); }}
              />
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
                  You have used <span className="text-rose-600 font-black">{generationsUsed}</span> of <span className="text-slate-900 font-black">{TIER_LIMITS[userTier]}</span> generations.
                </p>
              </div>
              <div className="space-y-3 mb-8">
                {[
                  { key: "starter" as const, name: "Starter", price: "$24", gens: "50 generations", desc: "Best for beginners" },
                  { key: "pro" as const, name: "Pro", price: "$49", gens: "200 generations", desc: "Best for power sellers" },
                ].map(plan => (
                  <button key={plan.key} onClick={() => { setUserTier(plan.key); setShowUpgradeModal(false); }}
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
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function ImageUpload({ onImageUpload, imageUrl }: { onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void; imageUrl: string | null }) {
  return (
    <label className="flex flex-col items-center justify-center w-full min-h-[160px] bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2.5rem] cursor-pointer hover:bg-slate-100 transition-all text-slate-400 overflow-hidden relative group">
      {imageUrl ? (
        <>
          <img src={imageUrl} alt="Uploaded product" className="w-full h-auto object-contain"/>
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

function PricingCard({ tier, price, generations, description, features, isPopular, tierKey, currentTier, onSelect, onRequestCheckout }: any) {
  const [loading, setLoading] = useState(false);

  const PRICE_IDS: Record<string, string> = {
    starter: "price_1TXDjcB7i0tTYaLUodi6N2Zy",
    pro:     "price_1TXDk3B7i0tTYaLUBr36BDko",
  };

  function handleBuy() {
    if (tierKey === "free") { onSelect("free"); return; }
    const priceId = PRICE_IDS[tierKey];
    if (!priceId) { alert("Price not configured for this plan."); return; }
    // Open email modal in parent, passing priceId
    onRequestCheckout(priceId);
  }

  const isCurrent = currentTier === tierKey;
  const isFree = tierKey === "free";

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
          {!isFree && <span className="text-sm text-slate-400 font-medium">one-time</span>}
        </div>
        <div className="mt-3 inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full text-sm font-bold">
          <Zap size={16} />
          {generations}
        </div>
      </div>
      
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
        disabled={loading || isCurrent}
        className={`w-full py-4 rounded-xl text-sm font-bold transition-all duration-200 ${
          isCurrent 
            ? "bg-emerald-100 text-emerald-700 cursor-default"
            : isFree
            ? "bg-slate-100 text-slate-700 hover:bg-slate-200 border-2 border-slate-300"
            : isPopular
            ? "bg-gradient-to-r from-rose-500 to-rose-600 text-white hover:from-rose-600 hover:to-rose-700 shadow-lg shadow-rose-200"
            : "bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-200"
        }`}
      >
        {loading ? "Processing..." : isCurrent ? "Current Plan" : isFree ? "Get Started Free" : "Buy Credits"}
      </button>
    </div>
  );
}