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

// Sub-component wrapper for file uploading
function ImageUpload({ onImageUpload, imageUrl }: { onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void, imageUrl: string | null }) {
  return (
    <div className="relative border-2 border-dashed border-slate-200 hover:border-rose-400 bg-slate-50 rounded-2xl p-6 transition-all group flex flex-col items-center justify-center text-center min-h-[160px]">
      {imageUrl ? (
        <div className="relative w-full h-full max-h-[140px] flex items-center justify-center overflow-hidden rounded-xl bg-white">
          <img src={imageUrl} alt="Uploaded snapshot" className="max-h-[130px] object-contain" />
          <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-black uppercase tracking-widest cursor-pointer transition-all">
            Change Photo
            <input type="file" accept="image/*" onChange={onImageUpload} className="hidden" />
          </label>
        </div>
      ) : (
        <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer py-4">
          <Upload className="text-slate-400 group-hover:text-rose-500 transition-colors mb-2" size={28} />
          <span className="text-xs font-black text-slate-700 uppercase tracking-wider block">Drop Image Here</span>
          <span className="text-[10px] font-bold text-slate-400 block mt-1">PNG, JPG up to 10MB</span>
          <input type="file" accept="image/*" onChange={onImageUpload} className="hidden" />
        </label>
      )}
    </div>
  );
}

// ─── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [productName, setProductName]               = useState("");
  const [isLoading, setIsLoading]                     = useState(false);
  const [isGeneratingImage, setIsGeneratingImage]     = useState(false);
  const [isEnhancingSEO, setIsEnhancingSEO]           = useState(false);
  const [strategy, setStrategy]                        = useState<PinStrategy | null>(null);
  const [selectedAngleIndex, setSelectedAngleIndex] = useState<number | null>(null);
  const [overlayPosition, setOverlayPosition]         = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging]                    = useState(false);
  const [editableHeadline, setEditableHeadline]       = useState("");
  const [editableSubtext, setEditableSubtext]          = useState("");
  const [editableCTA, setEditableCTA]                  = useState("");
  const [uploadedImage, setUploadedImage]              = useState<string | null>(null);
  const [generatedImage, setGeneratedImage]            = useState<string | null>(null);
  const [copiedField, setCopiedField]                  = useState<string | null>(null);
  const [error, setError]                              = useState<string | null>(null);
  const [aspectRatio, setAspectRatio]               = useState<"9:16"|"2:3">("9:16");
  const [overlayScale, setOverlayScale]             = useState(1);
  const [isAnalyzingImage, setIsAnalyzingImage]     = useState(false);
  const [socialProof, setSocialProof]               = useState<{ stars?: number; reviews?: string; sold?: string } | null>(null);
  const [productUrl, setProductUrl]                 = useState("");
  const [customVisualPrompt, setCustomVisualPrompt] = useState("");

  // ── User state and generation tracking ─────────────────────────────────
  const [userName, setUserName]                       = useState("");
  const [userEmail, setUserEmail]                      = useState("");
  const [userTier, setUserTier]                       = useState<"free" | "starter" | "pro" | "scale">("free");
  const [generationsUsed, setGenerationsUsed]         = useState(0);
  const [showUpgradeModal, setShowUpgradeModal]       = useState(false);

  const [showEmailModal, setShowEmailModal]           = useState(false);
  const [pendingPriceId, setPendingPriceId]           = useState<string | null>(null);
  const [emailInput, setEmailInput]                    = useState("");
  const [paymentSuccess, setPaymentSuccess]           = useState(false);
  const [isLoadingUser, setIsLoadingUser]              = useState(false);

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
      el.style.height = (aspectRatio === "9:16" ? (w * 16 / 9) : (w * 3 / 2)) + "px";
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
    setGeneratedImage(null); // Clear out the previously generated image for the new angle scene pipeline
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
5. aiImagePrompt (50-80 word descriptive scene)
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
      
      const finalPrompt =
        `Environment: ${customVisualPrompt || base}. ` +
        `Professional Pinterest product photography. Sharp focus, beautiful bokeh, lifestyle aesthetic.`;

      const payload: any = { 
        prompt: finalPrompt,
        aspectRatio: aspectRatio 
      };
      
      if (uploadedImage?.startsWith("data:")) {
        payload.imageB64  = uploadedImage.split(",")[1];
        payload.imageMime = uploadedImage.split(";")[0].split(":")[1];
      }
      const res  = await fetch("/api/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Image generation failed");
      if (!data.imageB64) throw new Error("No image returned. Please try again.");

      setGeneratedImage(`data:image/png;base64,${data.imageB64}`);
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
      const angle   = strategy.angles[selectedAngleIndex];
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
      const W = 1000;
      const H = aspectRatio === "9:16" ? 1500 : 1333;

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

        {/* ── User info bar ─────────────────────────────────────────── */}
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

            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-2">
                <Zap size={14} className={generationsLeft <= 3 ? "text-rose-500" : "text-emerald-500"}/>
                <span className="text-[11px] font-bold text-slate-600">
                  Generation Usage: <span className="text-slate-900">{generationsUsed}</span> / {TIER_LIMITS[userTier]}
                </span>
              </div>
              <button 
                onClick={generateStrategy}
                disabled={isLoading || !productName.trim()}
                className="px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md shadow-rose-100 disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none flex items-center gap-2"
              >
                {isLoading ? <Loader2 className="animate-spin" size={14}/> : "Unlock Viral Blueprint"}
              </button>
            </div>
          </div>
        </section>

        {/* ── Error Output Box ───────────────────────────────────────────────── */}
        {error && (
          <div className="max-w-4xl mx-auto mb-8 bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center gap-3 text-rose-700">
            <AlertCircle size={18} className="shrink-0" />
            <span className="text-xs font-bold leading-tight">{error}</span>
          </div>
        )}

        {/* ── Main Strategy Blueprint Panel Splitter ─────────────────────────── */}
        {strategy && (
          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left Column Workspace - Config cards and strategy variants */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Marketing Blueprint Tab Selectors */}
              <div className="bg-white rounded-3xl border border-slate-200 p-2 shadow-sm space-y-1">
                <p className="text-[9px] font-black tracking-widest text-slate-400 uppercase px-3 pt-2 pb-1">Select Marketing Angle</p>
                {strategy.angles.map((ang, idx) => (
                  <button 
                    key={idx}
                    onClick={() => selectAngle(idx, ang)}
                    className={cn("w-full text-left px-4 py-3.5 rounded-2xl flex items-center justify-between transition-all group",
                      selectedAngleIndex === idx ? "bg-rose-50 border border-rose-100 text-rose-700 font-black shadow-inner-sm" : "hover:bg-slate-50 text-slate-600 font-bold")}
                  >
                    <div className="flex flex-col">
                      <span className="text-xs leading-snug">{ang.title}</span>
                      <span className="text-[10px] font-bold text-slate-400 group-hover:text-rose-400 mt-0.5 max-w-[280px] truncate">{ang.hook}</span>
                    </div>
                    <ArrowRight size={14} className={cn("opacity-0 transition-all", selectedAngleIndex === idx ? "opacity-100 text-rose-600 translate-x-1" : "group-hover:opacity-40")} />
                  </button>
                ))}
              </div>

              {/* Live Overlay Customization Drawer Card */}
              {selectedAngleIndex !== null && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-100 space-y-5">
                  <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                    <Palette size={16} className="text-rose-500"/>
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Customize Overlay Copy</h3>
                  </div>

                  {/* Headline selectors variant box */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Headline Overlay Variants</label>
                    <div className="flex flex-wrap gap-1.5 max-h-[85px] overflow-y-auto p-1 bg-slate-50 rounded-xl border border-slate-100">
                      {strategy.angles[selectedAngleIndex].headlines.map((hl, i) => (
                        <button key={i} onClick={() => setEditableHeadline(hl)}
                          className={cn("text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-all text-left truncate max-w-[100%]", 
                            editableHeadline === hl ? "bg-white border-rose-200 text-rose-600 shadow-sm" : "bg-white hover:bg-slate-100 border-slate-200 text-slate-600")}>
                          {hl}
                        </button>
                      ))}
                    </div>
                    <input type="text" value={editableHeadline} onChange={e => setEditableHeadline(e.target.value)}
                      className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-xs font-bold text-slate-800 mt-1" />
                  </div>

                  {/* Subtext lines options */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Subtext Overlay Variants</label>
                    <div className="flex flex-wrap gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-100">
                      {strategy.angles[selectedAngleIndex].subtext.map((st, i) => (
                        <button key={i} onClick={() => setEditableSubtext(st)}
                          className={cn("text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-all text-left", 
                            editableSubtext === st ? "bg-white border-rose-200 text-rose-600 shadow-sm" : "bg-white hover:bg-slate-100 border-slate-200 text-slate-600")}>
                          {st}
                        </button>
                      ))}
                    </div>
                    <input type="text" value={editableSubtext} onChange={e => setEditableSubtext(e.target.value)}
                      className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text-xs font-bold text-slate-700 mt-1" />
                  </div>

                  {/* CTA line */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Action Call Button Text</label>
                    <input type="text" value={editableCTA} onChange={e => setEditableCTA(e.target.value)}
                      className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none text