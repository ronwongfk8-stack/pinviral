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
  const [isMockMode, setIsMockMode]                   = useState(true);
  const [isEnhancingSEO, setIsEnhancingSEO]           = useState(false);
  const [strategy, setStrategy]                       = useState<PinStrategy | null>(null);
  const [selectedAngleIndex, setSelectedAngleIndex] = useState<number | null>(null);
  const [overlayPosition, setOverlayPosition]         = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging]                   = useState(false);
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

  // ── NEW: User state and generation tracking ─────────────────────────────────
  const [userName, setUserName]                       = useState("");
  const [userEmail, setUserEmail]                     = useState("");
  const [userTier, setUserTier]                       = useState<"free" | "starter" | "pro" | "scale">("free");
  const [generationsUsed, setGenerationsUsed]         = useState(0);
  const [showUpgradeModal, setShowUpgradeModal]       = useState(false);

  const TIER_LIMITS = { free: 3, starter: 50, pro: 200, scale: 999999 };
  const TIER_NAMES = { free: "Free Trial", starter: "Starter", pro: "Pro", scale: "Scale" };

  const generationsLeft = TIER_LIMITS[userTier] - generationsUsed;

  const previewRef = useRef<HTMLDivElement>(null);
  const CREATION_COSTS = { STRATEGY: 1, IMAGE: 1 };

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

    // Mock / draft mode — zero cost preview
    if (isMockMode) {
      setIsGeneratingImage(true);
      await new Promise(r => setTimeout(r, 1200));
      setGeneratedImage(
        (uploadedImage || "") + (uploadedImage?.includes("?") ? "&" : "?") + "mock=" + Date.now()
      );
      setIsGeneratingImage(false);
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
        `Professional Pinterest product photography. Sharp focus, beautiful bokeh, lifestyle aesthetic.`;

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
      const url  = await toPng(previewRef.current, { cacheBust: true, pixelRatio: 3, style: { borderRadius: "0", boxShadow: "none", margin: "0" } });
      const link = Object.assign(document.createElement("a"), { href: url, download: `pinterest-pin-${productName.replace(/\s+/g,"-").toLowerCase()||"design"}.png` });
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } catch { setError("Download failed. Right-click the image and select 'Save Image As'."); }
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
                      {/* Draft mode toggle */}
                      <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg" title="Draft mode: preview without using API credits">
                        <span className={cn("text-[9px] font-black px-2 uppercase tracking-tight", isMockMode ? "text-emerald-600" : "text-slate-400")}>Draft</span>
                        <button onClick={() => setIsMockMode(v => !v)}
                          className={cn("w-8 h-4 rounded-full transition-all relative", isMockMode ? "bg-emerald-500" : "bg-slate-300")}>
                          <div className={cn("absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all", isMockMode ? "right-0.5" : "left-0.5")}/>
                        </button>
                      </div>
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

                  {/* Scale slider */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Overlay Size</span>
                      <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">{Math.round(overlayScale * 100)}%</span>
                    </div>
                    <input type="range" min="0.4" max="1.6" step="0.01" value={overlayScale} onChange={e => setOverlayScale(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-rose-600"/>
                  </div>

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

                  {/* Cloning mode */}
                  <div className="grid grid-cols-2 gap-2">
                    {(["direct","stylized","reimagine","variation"] as const).map(m => (
                      <button key={m} onClick={() => setCloningMode(m)}
                        className={cn("py-2 rounded-xl border-2 text-[9px] font-black uppercase transition-all tracking-widest capitalize",
                          cloningMode === m ? "bg-rose-600 border-rose-600 text-white" : "bg-white border-slate-100 text-slate-400 hover:border-rose-200")}>
                        {m}
                      </button>
                    ))}
                  </div>

                  {/* Custom prompt */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-2"><Palette size={10}/> Creative Mode</label>
                    <textarea value={customVisualPrompt} onChange={e => setCustomVisualPrompt(e.target.value)}
                      className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] text-slate-600 focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 outline-none transition-all h-20 resize-none font-medium"
                      placeholder="Describe the environment (e.g. 'Marble tabletop', 'Minimalist white studio')..."/>
                  </div>

                  <button onClick={() => generateImage()} disabled={isGeneratingImage}
                    className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white font-black text-sm rounded-2xl shadow-xl shadow-rose-100 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-60">
                    {isGeneratingImage ? <Loader2 className="animate-spin" size={18}/> : <Sparkles size={18}/>}
                    {isMockMode ? "Preview Visual (Draft)" : "Regenerate Visual Identity"}
                  </button>
                  <p className="text-[9px] text-slate-400 text-center font-bold italic">
                    {isMockMode ? "Draft mode is free -- toggle off to use real AI credits." : `Uses 1 generation. ${generationsLeft} remaining.`}
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
              <div className="bg-white p-6 sm:p-10 rounded-[3.5rem] border border-slate-200 shadow-2xl shadow-slate-200/50 min-h-[750px] flex flex-col">
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
                  className={cn("bg-slate-100 rounded-[3.5rem] overflow-hidden relative cursor-crosshair touch-none mx-auto w-full transition-all duration-700 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)]",
                    aspectRatio === "9:16" ? "max-w-[400px] aspect-[9/16]" : "max-w-[450px] aspect-[2/3]")}
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
                      <img src={generatedImage || uploadedImage || ""}  alt="Pin Design"
                        className="w-full h-full object-cover select-none pointer-events-none"
                        referrerPolicy="no-referrer" draggable={false}/>

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

                {/* Headline / subtext variants */}
                {selectedAngleIndex !== null && (
                  <div className="mt-auto pt-10 grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-slate-100">
                    <div className="space-y-4">
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
                    <div className="space-y-4">
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

                {/* Video storyboard */}
                {selectedAngleIndex !== null && strategy.angles[selectedAngleIndex].videoPrompts?.length > 0 && (
                  <div className="mt-12 pt-12 border-t border-slate-100 space-y-8">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600"><Sparkles size={18}/></div>
                          <h3 className="text-xl font-black text-slate-900 tracking-tight">Viral Video Storyboard</h3>
                        </div>
                        <p className="text-slate-400 text-sm font-medium">5 AI-optimized scripts for high-converting video Pins.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {strategy.angles[selectedAngleIndex].videoPrompts.map((prompt, i) => (
                        <div key={i} className="group flex gap-4 p-5 bg-white border border-slate-100 rounded-[2rem] hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-50/50 transition-all">
                          <div className="flex flex-col items-center gap-2 shrink-0">
                            <div className="w-8 h-8 bg-slate-50 group-hover:bg-indigo-500 rounded-full flex items-center justify-center text-[10px] font-black text-slate-400 group-hover:text-white transition-all">{i+1}</div>
                            <div className="w-px flex-1 bg-slate-100 group-hover:bg-indigo-100 transition-all"/>
                          </div>
                          <div className="space-y-2 py-1 flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest group-hover:text-indigo-400 transition-colors">Scene Script</span>
                              <button onClick={() => copyToClipboard(prompt, `video-${i}`)} className="text-slate-200 hover:text-indigo-600 transition-colors">
                                {copiedField === `video-${i}` ? <Check size={14} className="text-emerald-500"/> : <Copy size={14}/>}
                              </button>
                            </div>
                            <p className="text-xs text-slate-600 font-bold leading-relaxed">{prompt}</p>
                          </div>
                        </div>
                      ))}
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

        {/* Pricing */}
        <section id="pricing-section" className="py-24 border-t border-slate-100">
          <div className="max-w-6xl mx-auto px-4">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl md:text-5xl font-black text-slate-900 mb-6 tracking-tight leading-tight">
                Turn Products Into Viral Content — <span className="text-rose-600">Without Designers or Guesswork</span>
              </h2>
              <p className="text-lg text-slate-600 mb-2">Create high-converting Pinterest visuals in seconds.</p>
              <p className="text-sm font-bold text-rose-500 uppercase tracking-widest">Only pay for what you actually use.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              <PricingCard tier="Free Trial" price="$0" generations="3" description="Perfect for testing"
                features={["3 AI generations","5 viral angles","SEO descriptions","Hashtag suggestions"]} cta="Start Free" tierKey="free" currentTier={userTier} onSelect={setUserTier}/>
              <PricingCard tier="Starter" price="$24" generations="50" description="For beginners"
                features={["50 AI generations","All strategy features","Image generation","Social proof detection"]} cta="Get Starter" tierKey="starter" currentTier={userTier} onSelect={setUserTier}/>
              <PricingCard tier="Pro" price="$49" generations="200" description="For power sellers" isPopular
                features={["200 AI generations","Everything in Starter","Priority processing","Advanced cloning modes"]} cta="Go Pro" tierKey="pro" currentTier={userTier} onSelect={setUserTier}/>
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
                  { key: "starter" as const, name: "Starter", price: "$24/mo", gens: "50 generations", desc: "Best for beginners" },
                  { key: "pro" as const, name: "Pro", price: "$49/mo", gens: "200 generations", desc: "Best for power sellers" },
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

function PricingCard({ tier, price, generations, description, features, cta, isPopular = false, tierKey, currentTier, onSelect }: {
  tier: string; price: string; generations: string; description: string; features: string[]; cta: string;
  isPopular?: boolean; tierKey: string; currentTier: string; onSelect: (tier: "free" | "starter" | "pro" | "scale") => void;
}) {
  const isCurrent = currentTier === tierKey;
  return (
    <div className={cn("relative bg-white p-6 rounded-[32px] border transition-all flex flex-col h-full",
      isPopular ? "border-rose-200 shadow-xl shadow-rose-100 scale-105 z-10" : "border-slate-200 shadow-sm hover:shadow-md",
      isCurrent ? "ring-2 ring-emerald-400" : "")}>
      {isPopular && <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-rose-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest">Most Popular</div>}
      {isCurrent && <div className="absolute -top-4 right-4 bg-emerald-500 text-white text-[9px] font-bold px-2 py-1 rounded-full uppercase tracking-widest">Active</div>}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-lg font-bold text-slate-900 uppercase tracking-tight">{tier}</h3>
        </div>
        <div className="flex items-baseline gap-1 mb-1">
          <span className="text-4xl font-black text-slate-900">{price}</span>
          {price !== "Custom" && <span className="text-slate-400 text-sm font-medium">/ mo</span>}
        </div>
        <p className="text-[11px] font-black text-rose-600 mb-2">{generations} generations</p>
        <p className="text-slate-500 text-sm leading-relaxed">{description}</p>
      </div>
      <ul className="space-y-3 mb-8 flex-grow">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-600 font-medium">
            <Check size={16} className="text-emerald-500 shrink-0 mt-0.5"/><span>{f}</span>
          </li>
        ))}
      </ul>
      <button onClick={() => onSelect(tierKey as "free" | "starter" | "pro" | "scale")}
        className={cn("w-full py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2",
          isCurrent
            ? "bg-emerald-500 hover:bg-emerald-600 text-white"
            : isPopular ? "bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-200" : "bg-slate-900 hover:bg-slate-800 text-white")}>
        {isCurrent ? "Current Plan" : cta} <ArrowRight size={18}/>
      </button>
    </div>
  );
}