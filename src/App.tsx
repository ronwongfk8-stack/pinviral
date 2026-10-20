/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { GoogleGenAI, Type } from "@google/genai";
import { toPng } from "html-to-image";
import {
  Sparkles, Copy, Check, Image as ImageIcon, Loader2, ArrowRight,
  Upload, Download, RefreshCw, Zap, Search, Video, ExternalLink,
  Wand2, AlertCircle, Star, Plus, Hash, Accessibility, TrendingUp,
  Lock, Shuffle, Sun, Moon, Leaf, Home, Camera, Droplets, MapPin,
  Eye, Mic, Volume2, FileText, ChevronDown, ChevronUp, Play,
  CreditCard, Settings, X, ShieldCheck, Bolt, CheckCircle2, Key
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, initialDelay = 2000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try { return await fn(); } catch (err: any) {
      lastError = err;
      const msg = err.message || String(err);
      const isRetryable = msg.includes("503") || msg.includes("429") || msg.includes("UNAVAILABLE");
      if (!isRetryable || i === maxRetries - 1) break;
      await new Promise(r => setTimeout(r, initialDelay * Math.pow(2, i)));
    }
  }
  throw lastError;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ViralAngle {
  title: string; hook: string; psychology: string; headlines: string[];
  subtext: string[]; cta: string; pinDescription: string; hashtags: string[];
  altText: string; animationPrompt: string; aiImagePrompt: string;
}
interface PinStrategy { angles: ViralAngle[]; }
interface EnvironmentOption { id: string; label: string; icon: string; mood: string; prompt: string; }
interface ProductAnalysis { productDescription: string; keyVisualDetails: string; environments: EnvironmentOption[]; }
interface VoiceoverScript { tone: string; duration: string; script: string; hooks: string[]; }
type VoiceTone = "energetic" | "calm" | "luxury" | "trendy" | "asmr";

// ── Stripe types ──────────────────────────────────────────────────────────────

interface StripePriceIds {
  starter_monthly: string; starter_annual: string;
  pro_monthly: string;     pro_annual: string;
  scale_monthly: string;   scale_annual: string;
  agency_monthly: string;  agency_annual: string;
  topup_50img: string;     topup_10vid: string;
  topup_bundle_s: string;  topup_bundle_m: string;
  topup_bundle_l: string;
}

interface StripeConfig {
  publishableKey: string;
  secretKey: string;
  priceIds: Partial<StripePriceIds>;
  isSetup: boolean;
}

interface StripeProduct { id: string; name: string; }
interface StripePrice  { id: string; unit_amount: number; recurring?: { interval: string }; }

// ── Plan / Constants ──────────────────────────────────────────────────────────

const PLANS: Record<string, { images: number; videos: number; label: string }> = {
  free:    { images: 3,    videos: 0,   label: "Free"    },
  starter: { images: 50,   videos: 3,   label: "Starter" },
  pro:     { images: 150,  videos: 15,  label: "Pro"     },
  scale:   { images: 400,  videos: 50,  label: "Scale"   },
  agency:  { images: 1200, videos: 150, label: "Agency"  },
};

const PLAN_FEATURES: Record<string, { monthly: number; annual: number; images: number; videos: number; features: string[]; emoji: string; desc: string; bonus?: string; popular?: boolean }> = {
  starter: { monthly: 29, annual: 20, images: 50,   videos: 3,   emoji: "🟢", desc: "For beginners testing products",       features: ["50 AI images/mo","3 video pins/mo","Pinterest strategy","5 auto scene environments","Voiceover script generator"] },
  pro:     { monthly: 59, annual: 41, images: 150,  videos: 15,  emoji: "⭐", desc: "For serious sellers & creators",       features: ["150 AI images/mo","15 video pins/mo","Full strategy system","All scene environments","All voiceover tones","Faster generation"], bonus: "Best value for active sellers", popular: true },
  scale:   { monthly: 119,annual: 83, images: 400,  videos: 50,  emoji: "🚀", desc: "For power users & e-com brands",       features: ["400 AI images/mo","50 video pins/mo","Everything in Pro","Extended animation","High priority"] },
  agency:  { monthly: 199,annual: 139,images: 1200, videos: 150, emoji: "🏢", desc: "For agencies & white-label",           features: ["1,200 AI images/mo","150 video pins/mo","Everything in Scale","White-label exports","Team seats (5)","API access"] },
};

const TOPUP_PACKS = [
  { key: "topup_50img",    label: "50 Images",              price: 12,  highlight: false },
  { key: "topup_10vid",    label: "10 Videos",              price: 19,  highlight: false },
  { key: "topup_bundle_s", label: "50 Images + 5 Videos",   price: 25,  highlight: true  },
  { key: "topup_bundle_m", label: "100 Images + 15 Videos", price: 49,  highlight: false },
  { key: "topup_bundle_l", label: "250 Images + 40 Videos", price: 99,  highlight: false },
];

const VOICE_TONES: { id: VoiceTone; label: string; desc: string; emoji: string }[] = [
  { id: "energetic", label: "Energetic", desc: "High energy, exciting, action-driven",  emoji: "⚡" },
  { id: "calm",      label: "Calm",      desc: "Soft, reassuring, problem-solving",      emoji: "🌿" },
  { id: "luxury",    label: "Luxury",    desc: "Elegant, aspirational, premium feel",    emoji: "✨" },
  { id: "trendy",    label: "Trendy",    desc: "Gen Z, viral, conversational & fun",     emoji: "🔥" },
  { id: "asmr",      label: "ASMR",      desc: "Whispered, intimate, sensory detail",    emoji: "🎧" },
];

const ENV_ICONS: Record<string, React.ReactNode> = {
  sun: <Sun size={14} />, moon: <Moon size={14} />, leaf: <Leaf size={14} />,
  home: <Home size={14} />, camera: <Camera size={14} />, droplets: <Droplets size={14} />,
  mappin: <MapPin size={14} />, sparkles: <Sparkles size={14} />,
};

const BASE_REALISTIC_MOTION = "Create subtle, realistic motion: slight camera zoom (Ken Burns effect), soft lighting movement, gentle shadow shift, no distortion of the product, keep product shape 100% accurate, simulate real product photography video.";

const STRIPE_STORAGE_KEY = "pinviral_stripe_config";

// ── Stripe API helper ─────────────────────────────────────────────────────────

async function stripePost(secretKey: string, endpoint: string, params: Record<string, string>): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe error ${res.status}`);
  return data;
}

async function stripeGet(secretKey: string, endpoint: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`https://api.stripe.com/v1/${endpoint}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { "Authorization": `Bearer ${secretKey}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe error ${res.status}`);
  return data;
}

// ── StepCard ──────────────────────────────────────────────────────────────────

function StepCard({ number, title, subtitle, badge, children, dimmed = false }:
  { number: number; title: string; subtitle?: string; badge?: string; children: React.ReactNode; dimmed?: boolean }) {
  return (
    <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: dimmed ? 0.4 : 1, y: 0 }}
      transition={{ delay: number * 0.06 }} className={cn("relative", dimmed && "pointer-events-none select-none")}>
      <div className="flex items-center gap-3 mb-5">
        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shadow-lg shrink-0",
          number === 1 ? "bg-rose-600 text-white shadow-rose-200" : "bg-slate-900 text-white")}>
          {number}
        </div>
        <div>
          <h3 className="text-xl font-black text-slate-900 tracking-tight leading-none">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400 font-medium mt-0.5">{subtitle}</p>}
        </div>
        {badge && (
          <span className="ml-auto px-3 py-1 bg-rose-50 text-rose-600 text-[10px] font-black rounded-full uppercase tracking-tighter border border-rose-100 shrink-0">
            {badge}
          </span>
        )}
      </div>
      <div className="ml-[52px]">{children}</div>
    </motion.section>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  // core
  const [productName, setProductName]                       = useState("");
  const [isLoading, setIsLoading]                           = useState(false);
  const [isGeneratingImage, setIsGeneratingImage]           = useState(false);
  const [isAnimating, setIsAnimating]                       = useState(false);
  const [isAnalyzingProduct, setIsAnalyzingProduct]         = useState(false);
  const [isAnalyzingSocialProof, setIsAnalyzingSocialProof] = useState(false);
  const [animatedVideoUrl, setAnimatedVideoUrl]             = useState<string | null>(null);
  const [animationPrompt, setAnimationPrompt]               = useState("");
  const [hasApiKey, setHasApiKey]                           = useState(false);
  const [strategy, setStrategy]                             = useState<PinStrategy | null>(null);
  const [selectedAngleIndex, setSelectedAngleIndex]         = useState<number | null>(null);
  const [overlayPosition, setOverlayPosition]               = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging]                         = useState(false);
  const [editableHeadline, setEditableHeadline]             = useState("");
  const [editableSubtext, setEditableSubtext]               = useState("");
  const [editableCTA, setEditableCTA]                       = useState("");
  const [editableAltText, setEditableAltText]               = useState("");
  const [uploadedImage, setUploadedImage]                   = useState<string | null>(null);
  const [generatedImage, setGeneratedImage]                 = useState<string | null>(null);
  const [copiedField, setCopiedField]                       = useState<string | null>(null);
  const [error, setError]                                   = useState<string | null>(null);
  const [overlayScale, setOverlayScale]                     = useState(1);
  const [socialProof, setSocialProof]                       = useState<{ stars?: number; reviews?: string; sold?: string } | null>(null);
  const [productUrl, setProductUrl]                         = useState("");
  const [billingCycle, setBillingCycle]                     = useState<"monthly" | "annual">("monthly");
  const [imagesLeft, setImagesLeft]                         = useState(PLANS.free.images);
  const [videosLeft, setVideosLeft]                         = useState(PLANS.free.videos);
  const [currentPlan, setCurrentPlan]                       = useState("free");
  // environments
  const [productAnalysis, setProductAnalysis]               = useState<ProductAnalysis | null>(null);
  const [selectedEnvId, setSelectedEnvId]                   = useState<string | null>(null);
  const [customEnvPrompt, setCustomEnvPrompt]               = useState("");
  const [showCustomEnv, setShowCustomEnv]                   = useState(false);
  const [analysisError, setAnalysisError]                   = useState<string | null>(null);
  // voiceover
  const [voiceoverScript, setVoiceoverScript]               = useState<VoiceoverScript | null>(null);
  const [isGeneratingVoiceover, setIsGeneratingVoiceover]   = useState(false);
  const [selectedVoiceTone, setSelectedVoiceTone]           = useState<VoiceTone>("energetic");
  const [voiceoverExpanded, setVoiceoverExpanded]           = useState(true);

  // ── Stripe state ────────────────────────────────────────────────────────────
  const [stripeConfig, setStripeConfig]                     = useState<StripeConfig>({ publishableKey: "", secretKey: "", priceIds: {}, isSetup: false });
  const [showStripeSetup, setShowStripeSetup]               = useState(false);
  const [showUpgradeModal, setShowUpgradeModal]             = useState(false);
  const [isSettingUpStripe, setIsSettingUpStripe]           = useState(false);
  const [stripeSetupStep, setStripeSetupStep]               = useState<"keys" | "creating" | "done">("keys");
  const [stripeSetupProgress, setStripeSetupProgress]       = useState<string[]>([]);
  const [stripeSetupError, setStripeSetupError]             = useState<string | null>(null);
  const [tempPubKey, setTempPubKey]                         = useState("");
  const [tempSecKey, setTempSecKey]                         = useState("");
  const [checkoutLoading, setCheckoutLoading]               = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess]                 = useState<{ plan: string; billing: string } | null>(null);

  const previewRef = useRef<HTMLDivElement>(null);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    checkApiKey();
    // Load saved Stripe config
    try {
      const saved = localStorage.getItem(STRIPE_STORAGE_KEY);
      if (saved) {
        const cfg = JSON.parse(saved) as StripeConfig;
        setStripeConfig(cfg);
        if (cfg.isSetup) { setTempPubKey(cfg.publishableKey); setTempSecKey(cfg.secretKey); }
      }
    } catch {}

    // Handle Stripe redirect back
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const planKey   = params.get("plan");
    const billing   = params.get("billing") || "monthly";
    if (sessionId && planKey) {
      handlePaymentSuccess(planKey, billing);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (productUrl && productUrl.length > 8 && !isAnalyzingSocialProof && !socialProof) fetchSocialProof(null, productUrl);
    }, 2000);
    return () => clearTimeout(t);
  }, [productUrl]);

  useEffect(() => { if (imagesLeft <= 2 && imagesLeft > 0) setShowUpgradeModal(true); }, [imagesLeft]);
  useEffect(() => { if (generatedImage) {} }, [generatedImage]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const getAI = () => {
    const apiKey = (process.env as any).API_KEY || process.env.GEMINI_API_KEY || "";
    if (!apiKey) throw new Error("API_KEY_MISSING");
    return new GoogleGenAI({ apiKey });
  };

  const handleApiError = (err: any, fallback: string) => {
    const msg = err?.message || String(err);
    if (msg.includes("API_KEY_MISSING")) { setError("No API key. Please select one."); openKeyDialog(); return; }
    if (msg.includes("403") || msg.includes("PERMISSION_DENIED")) { setError("Permission denied. Check your API key."); openKeyDialog(); return; }
    setError(fallback || msg);
  };

  const checkApiKey = async () => {
    if (window.aistudio?.hasSelectedApiKey) setHasApiKey(await window.aistudio.hasSelectedApiKey());
  };

  const openKeyDialog = async () => {
    if (window.aistudio?.openSelectKey) { await window.aistudio.openSelectKey(); setHasApiKey(true); }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // ── Payment success handler ───────────────────────────────────────────────

  const handlePaymentSuccess = (planKey: string, billing: string) => {
    const plan = PLAN_FEATURES[planKey];
    if (plan) {
      setCurrentPlan(planKey);
      setImagesLeft(plan.images);
      setVideosLeft(plan.videos);
      setPaymentSuccess({ plan: planKey, billing });
      setTimeout(() => setPaymentSuccess(null), 6000);
    }
  };

  // ── Stripe Setup ──────────────────────────────────────────────────────────

  const saveConfig = (cfg: StripeConfig) => {
    setStripeConfig(cfg);
    try { localStorage.setItem(STRIPE_STORAGE_KEY, JSON.stringify(cfg)); } catch {}
  };

  const runStripeSetup = async () => {
    if (!tempSecKey.startsWith("sk_test_") && !tempSecKey.startsWith("sk_live_")) {
      setStripeSetupError("Please enter a valid Stripe secret key (starts with sk_test_ or sk_live_)");
      return;
    }
    if (!tempPubKey.startsWith("pk_test_") && !tempPubKey.startsWith("pk_live_")) {
      setStripeSetupError("Please enter a valid Stripe publishable key (starts with pk_test_ or pk_live_)");
      return;
    }

    setIsSettingUpStripe(true);
    setStripeSetupStep("creating");
    setStripeSetupProgress([]);
    setStripeSetupError(null);

    const log = (msg: string) => setStripeSetupProgress(p => [...p, msg]);
    const priceIds: Partial<StripePriceIds> = {};

    try {
      // ── Subscription plans ─────────────────────────────────────────────
      const subscriptionPlans = [
        { key: "starter", name: "PinViral Starter", monthly: 2900, annual: 24000 },
        { key: "pro",     name: "PinViral Pro",     monthly: 5900, annual: 49200 },
        { key: "scale",   name: "PinViral Scale",   monthly: 11900,annual: 99600 },
        { key: "agency",  name: "PinViral Agency",  monthly: 19900,annual: 166800 },
      ];

      for (const plan of subscriptionPlans) {
        log(`Creating product: ${plan.name}...`);
        const product: StripeProduct = await stripePost(tempSecKey, "products", {
          name: plan.name,
          description: `PinViral ${plan.key.charAt(0).toUpperCase() + plan.key.slice(1)} subscription plan`,
          "metadata[plan]": plan.key,
        });

        log(`  ✓ Product created (${product.id})`);
        log(`  Creating monthly price...`);

        const monthlyPrice: StripePrice = await stripePost(tempSecKey, "prices", {
          product: product.id,
          unit_amount: String(plan.monthly),
          currency: "usd",
          "recurring[interval]": "month",
          "metadata[plan]": plan.key,
          "metadata[billing]": "monthly",
        });
        (priceIds as any)[`${plan.key}_monthly`] = monthlyPrice.id;
        log(`  ✓ Monthly price: ${monthlyPrice.id}`);

        log(`  Creating annual price...`);
        const annualPrice: StripePrice = await stripePost(tempSecKey, "prices", {
          product: product.id,
          unit_amount: String(plan.annual),
          currency: "usd",
          "recurring[interval]": "year",
          "metadata[plan]": plan.key,
          "metadata[billing]": "annual",
        });
        (priceIds as any)[`${plan.key}_annual`] = annualPrice.id;
        log(`  ✓ Annual price: ${annualPrice.id}`);
      }

      // ── Top-up packs (one-time) ────────────────────────────────────────
      log(`Creating top-up packs...`);
      const topupItems = [
        { key: "topup_50img",    name: "PinViral Top-up: 50 Images",              amount: 1200 },
        { key: "topup_10vid",    name: "PinViral Top-up: 10 Videos",              amount: 1900 },
        { key: "topup_bundle_s", name: "PinViral Top-up: 50 Images + 5 Videos",   amount: 2500 },
        { key: "topup_bundle_m", name: "PinViral Top-up: 100 Images + 15 Videos", amount: 4900 },
        { key: "topup_bundle_l", name: "PinViral Top-up: 250 Images + 40 Videos", amount: 9900 },
      ];

      for (const item of topupItems) {
        const product: StripeProduct = await stripePost(tempSecKey, "products", {
          name: item.name,
          "metadata[type]": "topup",
          "metadata[key]": item.key,
        });
        const price: StripePrice = await stripePost(tempSecKey, "prices", {
          product: product.id,
          unit_amount: String(item.amount),
          currency: "usd",
          "metadata[key]": item.key,
        });
        (priceIds as any)[item.key] = price.id;
        log(`  ✓ ${item.name}`);
      }

      const cfg: StripeConfig = { publishableKey: tempPubKey, secretKey: tempSecKey, priceIds, isSetup: true };
      saveConfig(cfg);
      setStripeSetupStep("done");
      log("🎉 All products and prices created successfully!");
      log("Your Stripe integration is live in test mode.");

      setTimeout(() => setShowStripeSetup(false), 2000);

    } catch (err: any) {
      setStripeSetupError(err.message || "Failed to set up Stripe. Check your secret key and try again.");
      setStripeSetupStep("keys");
    } finally {
      setIsSettingUpStripe(false);
    }
  };

  // ── Stripe Checkout ───────────────────────────────────────────────────────

  const startCheckout = async (planKey: string, billing: "monthly" | "annual" = "monthly", topupKey?: string) => {
    if (!stripeConfig.isSetup) { setShowStripeSetup(true); return; }

    const loadingKey = topupKey || `${planKey}_${billing}`;
    setCheckoutLoading(loadingKey);

    try {
      const priceIdKey = topupKey ? topupKey : `${planKey}_${billing}`;
      const priceId = (stripeConfig.priceIds as any)[priceIdKey];
      if (!priceId) throw new Error("Price not found. Please re-run Stripe setup.");

      const isSubscription = !topupKey;
      const successUrl = `${window.location.href}${window.location.search ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}&plan=${planKey}&billing=${billing}`;
      const cancelUrl  = window.location.href;

      const params: Record<string, string> = {
        "payment_method_types[]": "card",
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": "1",
        success_url: successUrl,
        cancel_url: cancelUrl,
        mode: isSubscription ? "subscription" : "payment",
      };

      const session = await stripePost(stripeConfig.secretKey, "checkout/sessions", params);
      window.location.href = session.url;
    } catch (err: any) {
      setError(`Checkout failed: ${err.message}`);
    } finally {
      setCheckoutLoading(null);
    }
  };

  // ── AI helpers ────────────────────────────────────────────────────────────

  const selectAngle = (index: number, angle: ViralAngle) => {
    setSelectedAngleIndex(index);
    setEditableHeadline(angle.headlines[0]);
    setEditableSubtext(angle.subtext[0]);
    setEditableCTA(angle.cta);
    setEditableAltText(angle.altText);
    setAnimationPrompt(angle.animationPrompt);
  };

  const generateStrategy = async () => {
    if (!productName.trim()) return;
    setIsLoading(true); setError(null); setStrategy(null);
    setGeneratedImage(null); setAnimatedVideoUrl(null);
    setSocialProof(null); setProductAnalysis(null);
    setSelectedEnvId(null); setVoiceoverScript(null);

    try {
      const ai = getAI();
      const prompt = `You are a Pinterest viral growth expert + e-commerce strategist. Create 3 high-converting Pinterest pin strategies for: "${productName}". Visual vibe: Professional, Aesthetic, Lifestyle-focused. For each angle: Title, Hook, Viral Psychology, 5 Headlines, 3 Subtexts, CTA, SEO Description, 10 Hashtags, Alt Text, Animation Prompt, AI Image Prompt (2:3 ratio). CRITICAL: Pin description MUST be heavily optimized for Pinterest SEO.`;
      const schema = { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties: { angles: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { title: { type: Type.STRING }, hook: { type: Type.STRING }, psychology: { type: Type.STRING }, aiImagePrompt: { type: Type.STRING }, headlines: { type: Type.ARRAY, items: { type: Type.STRING } }, subtext: { type: Type.ARRAY, items: { type: Type.STRING } }, cta: { type: Type.STRING }, pinDescription: { type: Type.STRING }, hashtags: { type: Type.ARRAY, items: { type: Type.STRING } }, altText: { type: Type.STRING }, animationPrompt: { type: Type.STRING } }, required: ["title","hook","psychology","aiImagePrompt","headlines","subtext","cta","pinDescription","hashtags","altText","animationPrompt"] } } }, required: ["angles"] } };

      let response: any;
      try { response = await withRetry(() => ai.models.generateContent({ model: "gemini-3-flash-preview", contents: prompt, config: schema })); }
      catch (e: any) {
        if (e.message?.includes("403")) response = await withRetry(() => ai.models.generateContent({ model: "gemini-flash-latest", contents: prompt, config: schema }));
        else throw e;
      }
      const data = JSON.parse((response as any).text || "{}") as PinStrategy;
      setStrategy(data);
      if (data.angles?.length > 0) selectAngle(0, data.angles[0]);
    } catch (err: any) { handleApiError(err, "Failed to generate strategy."); }
    finally { setIsLoading(false); }
  };

  const analyzeProductImage = async (imageData: string) => {
    setIsAnalyzingProduct(true); setAnalysisError(null);
    setProductAnalysis(null); setSelectedEnvId(null); setShowCustomEnv(false);
    try {
      const ai = getAI();
      const base64 = imageData.split(",")[1]; const mime = imageData.split(";")[0].split(":")[1];
      const analysisPrompt = `Analyze this product image. Return JSON: { "productDescription": "one precise sentence", "keyVisualDetails": "comma-separated locked details", "environments": [ { "id":"env1","label":"2-3 words","icon":"sun|moon|leaf|home|camera|droplets|mappin|sparkles","mood":"one word","prompt":"Product photography: the exact same [product] — unchanged — placed in [detailed 50-80 word scene description]..." }, ...5 environments total ] }`;
      let response: any;
      try { response = await withRetry(() => ai.models.generateContent({ model: "gemini-3-flash-preview", contents: [{ role: "user", parts: [{ inlineData: { data: base64, mimeType: mime } }, { text: analysisPrompt }] }], config: { responseMimeType: "application/json" } })); }
      catch (e: any) {
        if (e.message?.includes("403")) response = await withRetry(() => ai.models.generateContent({ model: "gemini-flash-latest", contents: [{ role: "user", parts: [{ inlineData: { data: base64, mimeType: mime } }, { text: analysisPrompt }] }], config: { responseMimeType: "application/json" } }));
        else throw e;
      }
      const result = JSON.parse((response as any).text || "{}") as ProductAnalysis;
      setProductAnalysis(result);
      if (result.environments?.length > 0) setSelectedEnvId(result.environments[0].id);
    } catch (err: any) { setAnalysisError("Could not analyze product. Write a custom scene below."); setShowCustomEnv(true); }
    finally { setIsAnalyzingProduct(false); }
  };

  const fetchSocialProof = async (imageData: string | null, url?: string) => {
    if (!imageData && !url) return;
    setIsAnalyzingSocialProof(true);
    try {
      const ai = getAI(); const parts: any[] = [];
      if (imageData?.startsWith("data:")) parts.push({ inlineData: { data: imageData.split(",")[1], mimeType: imageData.split(";")[0].split(":")[1] } });
      const formattedUrl = url && !url.startsWith("http") ? `https://${url}` : url;
      parts.push({ text: `Analyze this product. ${formattedUrl ? "URL: " + formattedUrl + ". Use Google Search and URL Context." : ""} Detect star ratings, review counts, or sold counts. Return JSON: { hasSocialProof, stars, reviews, sold, suggestedHeadline, suggestedSubtext }` });
      const config: any = { responseMimeType: "application/json", tools: formattedUrl ? [{ googleSearch: {} }, { urlContext: {} }] : undefined, toolConfig: formattedUrl ? { includeServerSideToolInvocations: true } : undefined };
      let response: any;
      try { response = await withRetry(() => ai.models.generateContent({ model: "gemini-3-flash-preview", contents: [{ role: "user", parts }], config })); }
      catch (e: any) { if (e.message?.includes("403")) response = await withRetry(() => ai.models.generateContent({ model: "gemini-flash-latest", contents: [{ role: "user", parts }], config })); else throw e; }
      const result = JSON.parse((response as any).text || "{}");
      if (result.hasSocialProof) {
        setSocialProof({ stars: result.stars, reviews: result.reviews, sold: result.sold });
        if (result.suggestedHeadline) setEditableHeadline(result.suggestedHeadline);
        if (result.suggestedSubtext)  setEditableSubtext(result.suggestedSubtext);
      }
    } catch (err: any) { console.error(err); }
    finally { setIsAnalyzingSocialProof(false); }
  };

  const buildGenerationPrompt = () => {
    if (showCustomEnv && customEnvPrompt.trim()) return customEnvPrompt.trim();
    if (productAnalysis && selectedEnvId) { const env = productAnalysis.environments.find(e => e.id === selectedEnvId); if (env) return env.prompt; }
    if (strategy && selectedAngleIndex !== null) return strategy.angles[selectedAngleIndex].aiImagePrompt;
    return `High-quality Pinterest product photography for ${productName || "the product"}.`;
  };

  const generateImage = async () => {
    if (!strategy && !uploadedImage) return;
    if (imagesLeft <= 0) { setShowUpgradeModal(true); return; }
    setIsGeneratingImage(true); setError(null);
    try {
      const ai = getAI(); const finalPrompt = buildGenerationPrompt(); const parts: any[] = [];
      if (uploadedImage?.startsWith("data:")) parts.push({ inlineData: { data: uploadedImage.split(",")[1], mimeType: uploadedImage.split(";")[0].split(":")[1] } });
      const keyDetails = productAnalysis?.keyVisualDetails || ""; const productDesc = productAnalysis?.productDescription || productName || "the product";
      parts.push({ text: uploadedImage ? `Reference product image above. CRITICAL: Output product IDENTICAL to reference — same color, shape, branding, material. ONLY change background/setting/lighting. ${keyDetails ? "Preserve: " + keyDetails + "." : ""} Product: ${productDesc}. New scene: ${finalPrompt}. Output: 2:3 ratio, professional Pinterest photography.` : `Create 2:3 Pinterest pin image. Product: ${productDesc}. Scene: ${finalPrompt}. Style: ${strategy && selectedAngleIndex !== null ? strategy.angles[selectedAngleIndex].psychology : "professional lifestyle photography"}.` });
      let response: any;
      try { response = await withRetry(() => ai.models.generateContent({ model: "gemini-3.1-flash-image-preview", contents: { parts }, config: { imageConfig: { aspectRatio: "2:3", imageSize: "1K" } } })); }
      catch (e: any) { if (e.message?.includes("403")) response = await withRetry(() => ai.models.generateContent({ model: "gemini-2.5-flash-image", contents: { parts }, config: { imageConfig: { aspectRatio: "2:3" } } })); else throw e; }
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) { setGeneratedImage(`data:image/png;base64,${part.inlineData.data}`); setImagesLeft(p => p - 1); return; }
      }
      throw new Error("No image returned. Please try again.");
    } catch (err: any) { handleApiError(err, "Failed to generate image."); }
    finally { setIsGeneratingImage(false); }
  };

  const generateVoiceover = async () => {
    if (!strategy || selectedAngleIndex === null) return;
    setIsGeneratingVoiceover(true);
    try {
      const ai = getAI(); const angle = strategy.angles[selectedAngleIndex];
      const prompt = `Write a ${selectedVoiceTone.toUpperCase()} voiceover script (15-30 sec) for a Pinterest video pin. Product: ${productName}. Angle: ${angle.title}. Psychology: ${angle.psychology}. Headline: ${editableHeadline}. Benefit: ${editableSubtext}. CTA: ${editableCTA}. ${socialProof?.stars ? `Social proof: ${socialProof.stars} stars` : ""} TONES: ENERGETIC=punchy fast sentences; CALM=slow reassuring; LUXURY=sophisticated minimal; TRENDY=Gen Z casual; ASMR=whispered sensory. Return JSON: { "tone":"${selectedVoiceTone}", "duration":"estimated read time", "script":"full script with \\n line breaks and (pause) markers, 40-80 words", "hooks":["3 alternative opening lines"] }`;
      let response: any;
      try { response = await withRetry(() => ai.models.generateContent({ model: "gemini-3-flash-preview", contents: prompt, config: { responseMimeType: "application/json" } })); }
      catch (e: any) { if (e.message?.includes("403")) response = await withRetry(() => ai.models.generateContent({ model: "gemini-flash-latest", contents: prompt, config: { responseMimeType: "application/json" } })); else throw e; }
      setVoiceoverScript(JSON.parse((response as any).text || "{}"));
      setVoiceoverExpanded(true);
    } catch (err: any) { handleApiError(err, "Failed to generate voiceover script."); }
    finally { setIsGeneratingVoiceover(false); }
  };

  const animateImage = async () => {
    const src = generatedImage || uploadedImage; if (!src) return;
    if (videosLeft <= 0) { setShowUpgradeModal(true); return; }
    if (!hasApiKey) { await openKeyDialog(); return; }
    setIsAnimating(true); setError(null); setAnimatedVideoUrl(null);
    try {
      const apiKey = (process.env as any).API_KEY || process.env.GEMINI_API_KEY || "";
      const videoAi = new GoogleGenAI({ apiKey });
      const base64 = src.split(",")[1]; const mime = src.split(";")[0].split(":")[1];
      const finalPrompt = `${BASE_REALISTIC_MOTION} ${animationPrompt || `Animate: ${selectedAngleIndex !== null ? strategy?.angles[selectedAngleIndex]?.psychology : productName}. Smooth aesthetic motion, lifestyle feel.`}`;
      let operation = await withRetry(() => videoAi.models.generateVideos({ model: "veo-3.1-lite-generate-preview", prompt: finalPrompt, image: { imageBytes: base64, mimeType: mime }, config: { numberOfVideos: 1, resolution: "720p", aspectRatio: "9:16" } }));
      let polls = 0;
      while (!operation.done && polls < 60) { await new Promise(r => setTimeout(r, 10000)); operation = await withRetry(() => videoAi.operations.getVideosOperation({ operation })); polls++; }
      let safety = 0;
      while (operation.done && !operation.response && !operation.error && safety < 3) { await new Promise(r => setTimeout(r, 5000)); operation = await withRetry(() => videoAi.operations.getVideosOperation({ operation })); safety++; }
      if (operation.error) throw new Error(operation.error.message);
      const link = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (link) { const res = await fetch(link, { headers: { "x-goog-api-key": apiKey } }); if (!res.ok) throw new Error("Download failed"); setAnimatedVideoUrl(URL.createObjectURL(await res.blob())); setVideosLeft(p => p - 1); }
      else throw new Error("No video URL returned.");
    } catch (err: any) { handleApiError(err, "Failed to animate image."); }
    finally { setIsAnimating(false); }
  };

  const downloadVideo = () => { if (!animatedVideoUrl) return; const a = document.createElement("a"); a.href = animatedVideoUrl; a.download = `pinviral-video-${productName.replace(/\s+/g,"-").toLowerCase()}.mp4`; document.body.appendChild(a); a.click(); document.body.removeChild(a); };
  const downloadImage = async () => { if (!previewRef.current) return; try { const url = await toPng(previewRef.current, { cacheBust: true, pixelRatio: 2 }); const a = document.createElement("a"); a.href = url; a.setAttribute("download", `pinviral-pin-${productName.replace(/\s+/g,"-").toLowerCase()||"design"}.png`); document.body.appendChild(a); a.click(); document.body.removeChild(a); } catch { setError("Download failed. Right-click the image instead."); } };

  const handleDragStart = () => setIsDragging(true);
  const handleDrag = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const cx = "touches" in e ? e.touches[0].clientX : e.clientX; const cy = "touches" in e ? e.touches[0].clientY : e.clientY;
    setOverlayPosition({ x: Math.max(-40, Math.min(40, ((cx-rect.left)/rect.width)*100-50)), y: Math.max(-40, Math.min(40, ((cy-rect.top)/rect.height)*100-50)) });
  };
  const handleDragEnd = () => setIsDragging(false);

  const QuotaBar = ({ used, total, color }: { used: number; total: number; color: string }) => (
    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} transition-all duration-500`} style={{ width: `${total > 0 ? Math.min(100,(used/total)*100) : 0}%` }} />
    </div>
  );

  const sceneInfo = (() => {
    if (!uploadedImage) return null;
    if (showCustomEnv && customEnvPrompt) return { label: "Custom", color: "rose" };
    if (productAnalysis && selectedEnvId) { const e = productAnalysis.environments.find(e => e.id === selectedEnvId); if (e) return { label: e.label, color: "violet" }; }
    return null;
  })();

  // ── Stripe Setup Modal ────────────────────────────────────────────────────

  const StripeSetupModal = () => (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-[2rem] shadow-2xl max-w-lg w-full overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center"><CreditCard size={22} /></div>
              <div>
                <h3 className="font-black text-lg">Stripe Payment Setup</h3>
                <p className="text-slate-400 text-xs font-medium">Test mode · All products auto-created</p>
              </div>
            </div>
            <button onClick={() => setShowStripeSetup(false)} className="p-2 hover:bg-white/10 rounded-xl transition-all"><X size={18} /></button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {stripeSetupStep === "keys" && (
            <>
              {/* Test mode notice */}
              <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-200">
                <ShieldCheck size={18} className="text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-800">Test Mode Active</p>
                  <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">Use your Stripe test keys (sk_test_... / pk_test_...). No real charges will occur. Get your keys from <a href="https://dashboard.stripe.com/test/apikeys" target="_blank" rel="noreferrer" className="underline font-bold">dashboard.stripe.com/test/apikeys</a>.</p>
                </div>
              </div>

              {/* Secret key */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Lock size={11} /> Secret Key <span className="text-rose-500">*</span></label>
                <div className="relative">
                  <Key size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input type="password" placeholder="sk_test_••••••••••••••••••••••••"
                    className="w-full pl-10 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-mono text-slate-700 focus:ring-2 focus:ring-slate-400 outline-none transition-all"
                    value={tempSecKey} onChange={e => setTempSecKey(e.target.value)} />
                </div>
                <p className="text-[10px] text-slate-400 font-medium pl-1">Kept in localStorage · never sent to any server except Stripe</p>
              </div>

              {/* Publishable key */}
              <div className="space-y-1.5">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Key size={11} /> Publishable Key <span className="text-rose-500">*</span></label>
                <div className="relative">
                  <Key size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input type="text" placeholder="pk_test_••••••••••••••••••••••••"
                    className="w-full pl-10 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-mono text-slate-700 focus:ring-2 focus:ring-slate-400 outline-none transition-all"
                    value={tempPubKey} onChange={e => setTempPubKey(e.target.value)} />
                </div>
              </div>

              {stripeSetupError && (
                <div className="flex items-start gap-2 p-3 bg-rose-50 rounded-xl border border-rose-100">
                  <AlertCircle size={15} className="text-rose-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-rose-600 font-medium">{stripeSetupError}</p>
                </div>
              )}

              {/* What gets created */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">This setup will auto-create in Stripe:</p>
                <div className="grid grid-cols-2 gap-1.5 text-xs text-slate-600">
                  {["4 subscription products","Monthly + annual prices","5 top-up pack products","All prices in USD"].map(i => (
                    <div key={i} className="flex items-center gap-1.5"><Check size={12} className="text-emerald-500 shrink-0" />{i}</div>
                  ))}
                </div>
              </div>

              <button onClick={runStripeSetup} disabled={!tempSecKey || !tempPubKey || isSettingUpStripe}
                className="w-full py-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white font-black rounded-2xl transition-all flex items-center justify-center gap-2 text-sm">
                {isSettingUpStripe ? <><Loader2 className="animate-spin" size={18} /> Setting Up...</> : <><CreditCard size={18} /> Create Products &amp; Activate Stripe</>}
              </button>
            </>
          )}

          {stripeSetupStep === "creating" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 justify-center py-2">
                <div className="relative w-12 h-12">
                  <div className="absolute inset-0 border-4 border-slate-100 rounded-full" />
                  <div className="absolute inset-0 border-4 border-slate-900 rounded-full border-t-transparent animate-spin" />
                </div>
                <div>
                  <p className="font-black text-slate-900">Creating Stripe products...</p>
                  <p className="text-xs text-slate-400">This takes about 10-15 seconds</p>
                </div>
              </div>
              <div className="bg-slate-900 rounded-2xl p-4 h-48 overflow-y-auto font-mono text-xs space-y-1">
                {stripeSetupProgress.map((msg, i) => (
                  <p key={i} className={cn("leading-relaxed", msg.startsWith("🎉") ? "text-emerald-400 font-bold" : msg.startsWith("  ✓") ? "text-emerald-400" : msg.startsWith("  ") ? "text-slate-400" : "text-white")}>{msg}</p>
                ))}
                {isSettingUpStripe && <p className="text-slate-500 animate-pulse">▊</p>}
              </div>
              {stripeSetupError && (
                <div className="flex items-start gap-2 p-3 bg-rose-50 rounded-xl border border-rose-100">
                  <AlertCircle size={15} className="text-rose-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-rose-600 font-medium">{stripeSetupError}</p>
                </div>
              )}
            </div>
          )}

          {stripeSetupStep === "done" && (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 size={36} className="text-emerald-500" />
              </div>
              <div>
                <p className="font-black text-slate-900 text-lg">Stripe is ready! 🎉</p>
                <p className="text-slate-500 text-sm mt-1">All products and prices created in test mode. Checkout buttons are now live.</p>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );

  // ── Upgrade Modal ─────────────────────────────────────────────────────────

  const UpgradeModal = () => (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        className="bg-white p-8 rounded-[2rem] shadow-2xl max-w-sm w-full text-center space-y-6">
        <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto text-rose-600"><TrendingUp size={32} /></div>
        <div>
          <h4 className="text-xl font-black text-slate-900 mb-2">Out of {imagesLeft <= 0 ? "Images" : "Videos"}</h4>
          <p className="text-slate-500 text-sm">Upgrade to keep creating viral content.</p>
        </div>
        <div className="space-y-3 text-left">
          {(["starter","pro","scale"] as const).map(key => {
            const p = PLAN_FEATURES[key];
            const loading = checkoutLoading === `${key}_monthly`;
            return (
              <button key={key} onClick={() => startCheckout(key, "monthly")} disabled={!!checkoutLoading}
                className={cn("w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border-2 transition-all hover:scale-[1.01] disabled:opacity-60",
                  p.popular ? "border-rose-500 bg-rose-50" : "border-slate-100 hover:border-rose-200")}>
                <div className="text-left">
                  <p className="font-black text-slate-900 text-sm">{p.emoji} {key.charAt(0).toUpperCase()+key.slice(1)} {p.popular && <span className="text-rose-600 text-[10px] uppercase ml-1">Popular</span>}</p>
                  <p className="text-[10px] text-slate-400">{p.images} images · {p.videos} videos/mo</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-rose-600">${p.monthly}/mo</span>
                  {loading && <Loader2 size={14} className="animate-spin text-rose-500" />}
                </div>
              </button>
            );
          })}
        </div>
        {!stripeConfig.isSetup && (
          <p className="text-xs text-slate-400 flex items-center justify-center gap-1">
            <Settings size={12} /> <button onClick={() => { setShowUpgradeModal(false); setShowStripeSetup(true); }} className="underline hover:text-slate-600">Setup Stripe first</button> to activate checkout
          </p>
        )}
        <button onClick={() => setShowUpgradeModal(false)} className="text-slate-400 text-xs hover:underline">Maybe later</button>
      </motion.div>
    </div>
  );

  // ── Pricing Card ──────────────────────────────────────────────────────────

  const PricingCard = ({ planKey }: { planKey: string }) => {
    const p = PLAN_FEATURES[planKey];
    const price = billingCycle === "annual" ? p.annual : p.monthly;
    const loading = checkoutLoading === `${planKey}_${billingCycle}`;
    return (
      <div className={cn("relative bg-white p-6 rounded-[28px] border flex flex-col h-full transition-all duration-300",
        p.popular ? "border-rose-200 shadow-xl shadow-rose-100 scale-105 z-10" : "border-slate-200 shadow-sm hover:shadow-md")}>
        {p.popular && <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-rose-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest whitespace-nowrap">Most Popular</div>}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1"><span className="text-xl">{p.emoji}</span><h3 className="text-base font-bold text-slate-900 uppercase tracking-tight">{planKey.charAt(0).toUpperCase()+planKey.slice(1)}</h3></div>
          <div className="flex items-baseline gap-1 mb-0.5"><span className="text-3xl font-black text-slate-900">${price}</span><span className="text-slate-400 text-sm">/mo</span></div>
          {billingCycle === "annual" && <p className="text-[10px] font-bold text-emerald-600">${Math.round(price*12)} billed annually</p>}
          <p className="text-slate-500 text-xs mt-1">{p.desc}</p>
        </div>
        <div className="flex gap-2 mb-4">
          <div className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 rounded-xl border border-rose-100"><ImageIcon size={11} className="text-rose-500" /><span className="text-[11px] font-black text-rose-700">{p.images.toLocaleString()} imgs</span></div>
          <div className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 rounded-xl border border-indigo-100"><Video size={11} className="text-indigo-500" /><span className="text-[11px] font-black text-indigo-700">{p.videos} vids</span></div>
        </div>
        <ul className="space-y-1.5 mb-5 flex-grow">{p.features.map((f,i) => <li key={i} className="flex items-start gap-2 text-xs text-slate-600"><Check size={13} className="text-emerald-500 shrink-0 mt-0.5" />{f}</li>)}</ul>
        {p.bonus && <div className="p-3 bg-rose-50 rounded-xl border border-rose-100 mb-4"><div className="flex items-center gap-1 text-rose-600 font-bold text-xs mb-0.5"><Sparkles size={11} /> Bonus</div><p className="text-rose-700 text-[11px] font-medium">{p.bonus}</p></div>}
        <button onClick={() => startCheckout(planKey, billingCycle)} disabled={!!checkoutLoading}
          className={cn("w-full py-3.5 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60",
            p.popular ? "bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-200" : "bg-slate-900 hover:bg-slate-800 text-white")}>
          {loading ? <><Loader2 className="animate-spin" size={16} /> Processing...</> : <><CreditCard size={15} /> {stripeConfig.isSetup ? "Subscribe" : "Setup & Subscribe"} <ArrowRight size={14} /></>}
        </button>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-900 font-sans selection:bg-rose-100 selection:text-rose-600">

      {/* Payment success toast */}
      <AnimatePresence>
        {paymentSuccess && (
          <motion.div initial={{ opacity: 0, y: -60 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -60 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] bg-emerald-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3">
            <CheckCircle2 size={22} />
            <div>
              <p className="font-black text-sm">Payment Successful! 🎉</p>
              <p className="text-emerald-100 text-xs">{PLAN_FEATURES[paymentSuccess.plan]?.emoji} {paymentSuccess.plan.charAt(0).toUpperCase()+paymentSuccess.plan.slice(1)} plan activated · {paymentSuccess.billing} billing</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-rose-600 rounded-lg flex items-center justify-center text-white"><Sparkles size={18} /></div>
            <h1 className="font-bold text-xl tracking-tight">PinViral</h1>
          </div>
          <div className="flex items-center gap-3">
            {!hasApiKey && (
              <button onClick={openKeyDialog} className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold rounded-lg hover:bg-amber-100 transition-all">
                <AlertCircle size={13} /> AI Key Required
              </button>
            )}

            {/* Stripe status button */}
            <button onClick={() => setShowStripeSetup(true)}
              className={cn("flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-all",
                stripeConfig.isSetup ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100" : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100")}>
              <CreditCard size={13} />
              {stripeConfig.isSetup ? "Stripe ✓" : "Setup Stripe"}
            </button>

            <div className="hidden sm:flex flex-col gap-1 min-w-[130px]">
              <div className="flex items-center justify-between text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                <span className="flex items-center gap-1"><ImageIcon size={9} /> Images</span>
                <span className={imagesLeft <= 2 ? "text-rose-600 animate-pulse" : ""}>{imagesLeft} left</span>
              </div>
              <QuotaBar used={PLANS[currentPlan].images - imagesLeft} total={PLANS[currentPlan].images} color="bg-rose-500" />
              <div className="flex items-center justify-between text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                <span className="flex items-center gap-1"><Video size={9} /> Videos</span>
                <span className={videosLeft <= 0 ? "text-indigo-600 animate-pulse" : ""}>{videosLeft} left</span>
              </div>
              <QuotaBar used={PLANS[currentPlan].videos - videosLeft} total={Math.max(PLANS[currentPlan].videos,1)} color="bg-indigo-500" />
            </div>

            <button onClick={() => document.getElementById("pricing-section")?.scrollIntoView({ behavior: "smooth" })}
              className="hidden sm:flex px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-100 transition-all">
              Upgrade
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-12">

        {/* Hero */}
        <section className="text-center mb-12">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <h2 className="text-4xl sm:text-6xl font-extrabold text-slate-900 mb-4 tracking-tight">
              What are you <span className="text-rose-600">selling</span> today?
            </h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto mb-8">Follow the steps below — from product to viral pin in minutes.</p>
            <div className="max-w-2xl mx-auto space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400"><Search size={20} /></div>
                  <input type="text" placeholder="e.g. Minimalist Ceramic Vase"
                    className="w-full pl-12 pr-4 py-5 bg-white border border-slate-200 rounded-3xl shadow-sm focus:ring-2 focus:ring-rose-500 outline-none transition-all text-lg text-slate-700"
                    value={productName} onChange={e => setProductName(e.target.value)} onKeyDown={e => e.key === "Enter" && generateStrategy()} />
                </div>
                <button onClick={generateStrategy} disabled={isLoading || !productName.trim()}
                  className="px-10 py-5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white font-bold rounded-3xl shadow-lg shadow-rose-200 transition-all flex items-center justify-center gap-2 group">
                  {isLoading ? <Loader2 className="animate-spin" size={24} /> : <>Generate Strategy <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" /></>}
                </button>
              </div>
              <AnimatePresence>
                {error && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    className="bg-rose-50 border border-rose-100 p-4 rounded-2xl text-rose-700 text-sm font-medium flex items-start gap-3">
                    <AlertCircle size={18} className="shrink-0 mt-0.5" /><p>{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </section>

        {/* Steps */}
        {strategy && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-24">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">

              {/* Left column */}
              <div className="lg:col-span-7 space-y-10">

                {/* Step 1 */}
                <StepCard number={1} title="Choose Viral Angle" subtitle="Pick the psychology behind your pin">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {strategy.angles.map((angle, i) => (
                      <button key={i} onClick={() => selectAngle(i, angle)}
                        className={cn("p-5 rounded-[1.75rem] border-2 text-left transition-all hover:scale-[1.02] flex flex-col h-full group",
                          selectedAngleIndex === i ? "bg-white border-rose-600 shadow-xl shadow-rose-100 ring-4 ring-rose-50" : "bg-white border-slate-100 shadow-sm hover:border-rose-200")}>
                        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-3 transition-colors",
                          selectedAngleIndex === i ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-400 group-hover:bg-rose-100 group-hover:text-rose-600")}>
                          <Zap size={18} />
                        </div>
                        <h4 className="font-black text-slate-900 mb-1.5 text-sm tracking-tight">{angle.title}</h4>
                        <p className="text-xs text-slate-500 leading-relaxed font-medium flex-1">{angle.hook}</p>
                        {selectedAngleIndex === i && <div className="mt-3 flex items-center gap-1.5 text-rose-600 text-[10px] font-black uppercase tracking-widest"><Check size={11} /> Selected</div>}
                      </button>
                    ))}
                  </div>
                </StepCard>

                {/* Step 2 */}
                <StepCard number={2} title="Upload Your Product Photo" subtitle="AI keeps your product identical — only the world around it changes">
                  <div className="space-y-4">
                    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        {uploadedImage ? (
                          <div className="relative rounded-2xl overflow-hidden border border-slate-100 aspect-square bg-slate-50">
                            <img src={uploadedImage} alt="Product" className="w-full h-full object-contain" />
                            {isAnalyzingProduct && <div className="absolute inset-0 bg-violet-900/65 backdrop-blur-sm flex flex-col items-center justify-center gap-2"><Loader2 className="animate-spin text-white" size={28} /><p className="text-white text-sm font-bold">Analyzing...</p></div>}
                            <button onClick={() => { setUploadedImage(null); setProductAnalysis(null); setSelectedEnvId(null); setGeneratedImage(null); setAnalysisError(null); }} className="absolute top-2 right-2 px-3 py-1 bg-white/90 text-rose-600 text-xs font-bold rounded-full shadow hover:bg-white transition-all">Remove</button>
                          </div>
                        ) : (
                          <label className="flex flex-col items-center justify-center aspect-square bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-100 transition-all group">
                            <input type="file" className="hidden" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onloadend = () => { const d = r.result as string; setUploadedImage(d); setGeneratedImage(null); analyzeProductImage(d); }; r.readAsDataURL(f); } }} />
                            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-300 group-hover:text-violet-500 transition-colors shadow-sm mb-3"><Upload size={24} /></div>
                            <p className="font-black text-slate-700">Upload Photo</p>
                            <p className="text-xs text-slate-400 mt-1">Auto-generates 5 scenes</p>
                          </label>
                        )}
                        <div className="flex flex-col justify-center space-y-3">
                          <div>
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Social Proof URL <span className="normal-case text-slate-300 font-normal">(optional)</span></p>
                            <div className="relative">
                              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-300"><ExternalLink size={15} /></div>
                              <input type="text" placeholder="amazon.com/your-product"
                                className="w-full pl-9 pr-16 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-700 focus:ring-2 focus:ring-rose-400 outline-none transition-all"
                                value={productUrl} onChange={e => setProductUrl(e.target.value)} />
                              {isAnalyzingSocialProof ? <div className="absolute right-3 top-1/2 -translate-y-1/2"><Loader2 size={13} className="animate-spin text-rose-500" /></div> :
                                productUrl ? <button onClick={() => fetchSocialProof(null, productUrl)} className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-rose-600 text-white text-[10px] font-bold rounded-xl hover:bg-rose-700 transition-all">Fetch</button> : null}
                            </div>
                          </div>
                          {socialProof && <div className="flex items-center gap-2 text-emerald-600 text-xs font-bold bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-100"><Check size={13} /> Social proof added</div>}
                        </div>
                      </div>
                    </div>

                    {/* Environment selector */}
                    <AnimatePresence>
                      {uploadedImage && (
                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                          className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
                          <div className="px-6 pt-5 pb-4 border-b border-slate-100">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 bg-violet-100 rounded-xl flex items-center justify-center text-violet-600"><Shuffle size={16} /></div>
                                <div><p className="font-black text-slate-900 text-sm">Scene Environment</p><p className="text-[10px] text-slate-400 font-medium">Same product · Different world</p></div>
                              </div>
                              {isAnalyzingProduct && <div className="flex items-center gap-1.5 text-violet-600 text-[10px] font-bold bg-violet-50 px-2.5 py-1 rounded-full border border-violet-100 animate-pulse"><Loader2 size={10} className="animate-spin" /> Generating...</div>}
                            </div>
                            {productAnalysis?.productDescription && (
                              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 space-y-2">
                                <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100"><Eye size={13} className="text-slate-400 mt-0.5 shrink-0" /><div><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Detected</p><p className="text-xs text-slate-700 font-medium">{productAnalysis.productDescription}</p></div></div>
                                {productAnalysis.keyVisualDetails && <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-xl border border-amber-100"><Sparkles size={13} className="text-amber-500 mt-0.5 shrink-0" /><div><p className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Locked details</p><p className="text-xs text-amber-700 font-medium">{productAnalysis.keyVisualDetails}</p></div></div>}
                              </motion.div>
                            )}
                            {analysisError && <div className="mt-2 flex items-start gap-2 p-3 bg-rose-50 rounded-xl border border-rose-100"><AlertCircle size={13} className="text-rose-500 mt-0.5 shrink-0" /><p className="text-xs text-rose-600 font-medium">{analysisError}</p></div>}
                          </div>

                          {isAnalyzingProduct && !productAnalysis && (
                            <div className="p-5 space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 animate-pulse"><div className="w-8 h-8 bg-slate-200 rounded-xl shrink-0" /><div className="flex-1 space-y-1.5"><div className="h-2.5 bg-slate-200 rounded w-1/3" /><div className="h-2 bg-slate-200 rounded w-2/3" /></div></div>)}</div>
                          )}

                          {productAnalysis?.environments && productAnalysis.environments.length > 0 && (
                            <div className="p-5 space-y-2">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Choose a Scene</p>
                              {productAnalysis.environments.map((env, i) => (
                                <motion.button key={env.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i*0.04 }}
                                  onClick={() => { setSelectedEnvId(env.id); setShowCustomEnv(false); }}
                                  className={cn("w-full flex items-start gap-3 p-3.5 rounded-2xl border-2 text-left transition-all hover:scale-[1.01]",
                                    selectedEnvId === env.id && !showCustomEnv ? "border-violet-500 bg-violet-50 shadow-md shadow-violet-100" : "border-slate-100 bg-slate-50 hover:border-violet-200")}>
                                  <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", selectedEnvId===env.id&&!showCustomEnv?"bg-violet-600 text-white":"bg-white text-slate-400")}>{ENV_ICONS[env.icon]||<Camera size={13}/>}</div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5"><p className="font-black text-slate-900 text-xs">{env.label}</p><span className={cn("px-1.5 py-0.5 text-[9px] font-black rounded-full uppercase",selectedEnvId===env.id&&!showCustomEnv?"bg-violet-200 text-violet-700":"bg-slate-200 text-slate-500")}>{env.mood}</span></div>
                                    <p className="text-[10px] text-slate-500 font-medium leading-relaxed line-clamp-1">{env.prompt}</p>
                                  </div>
                                  {selectedEnvId===env.id&&!showCustomEnv&&<Check size={13} className="text-violet-600 shrink-0 mt-1"/>}
                                </motion.button>
                              ))}
                              <motion.button initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: (productAnalysis?.environments?.length||0)*0.04 }}
                                onClick={() => setShowCustomEnv(true)}
                                className={cn("w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 text-left transition-all",showCustomEnv?"border-rose-500 bg-rose-50":"border-dashed border-slate-200 hover:border-rose-300")}>
                                <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0",showCustomEnv?"bg-rose-600 text-white":"bg-slate-100 text-slate-400")}><Wand2 size={14}/></div>
                                <div><p className="font-black text-slate-900 text-xs">Custom Scene</p><p className="text-[10px] text-slate-400">Write your own environment</p></div>
                                {showCustomEnv&&<Check size={13} className="text-rose-600 ml-auto"/>}
                              </motion.button>
                              <AnimatePresence>
                                {showCustomEnv && (
                                  <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:"auto" }} exit={{ opacity:0, height:0 }}>
                                    <textarea className="w-full p-4 bg-rose-50 border-2 border-rose-200 rounded-2xl text-sm text-slate-700 focus:ring-2 focus:ring-rose-400 outline-none resize-none h-24 font-medium placeholder-rose-300"
                                      value={customEnvPrompt} onChange={e => setCustomEnvPrompt(e.target.value)} placeholder={`Describe the new scene. Product stays identical — only the environment changes.`}/>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}
                          {!isAnalyzingProduct && !productAnalysis && (
                            <div className="p-5"><textarea className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-sm text-slate-700 focus:ring-2 focus:ring-violet-400 outline-none resize-none h-24 font-medium" value={customEnvPrompt} onChange={e => setCustomEnvPrompt(e.target.value)} placeholder="Describe the environment where your product should appear."/></div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </StepCard>

                {/* Step 3 — Copy & SEO */}
                <StepCard number={3} title="Copy & SEO Content" subtitle="Headlines, description and tags ready to copy" badge="Auto-generated">
                  {selectedAngleIndex !== null && (
                    <div className="space-y-4">
                      <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><Sparkles size={60}/></div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Viral Psychology</p>
                        <p className="text-slate-600 leading-relaxed font-medium italic text-sm">"{strategy.angles[selectedAngleIndex].psychology}"</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm">
                          <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600"><Search size={18}/></div><p className="font-black text-slate-900 text-sm">SEO Description</p></div><button onClick={() => copyToClipboard(strategy.angles[selectedAngleIndex].pinDescription,"desc")} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400">{copiedField==="desc"?<Check size={16} className="text-emerald-500"/>:<Copy size={16}/>}</button></div>
                          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100"><p className="text-slate-600 text-xs leading-relaxed whitespace-pre-wrap">{strategy.angles[selectedAngleIndex].pinDescription}</p></div>
                        </div>
                        <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm">
                          <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600"><Accessibility size={18}/></div><p className="font-black text-slate-900 text-sm">Alt Text</p></div><button onClick={() => copyToClipboard(editableAltText,"alt")} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400">{copiedField==="alt"?<Check size={16} className="text-emerald-500"/>:<Copy size={16}/>}</button></div>
                          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100"><textarea className="w-full bg-transparent text-slate-600 text-xs leading-relaxed outline-none resize-none h-24 font-medium" value={editableAltText} onChange={e=>setEditableAltText(e.target.value)} placeholder="Describe the image..."/></div>
                        </div>
                        <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm md:col-span-2">
                          <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600"><Hash size={18}/></div><p className="font-black text-slate-900 text-sm">Viral Tags</p></div><button onClick={() => copyToClipboard(strategy.angles[selectedAngleIndex].hashtags.join(" "),"tags")} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400">{copiedField==="tags"?<Check size={16} className="text-emerald-500"/>:<Copy size={16}/>}</button></div>
                          <div className="flex flex-wrap gap-2">{strategy.angles[selectedAngleIndex].hashtags.map((tag,i) => <span key={i} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-100">{tag}</span>)}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </StepCard>

                {/* Step 4 — Generate Visual */}
                <StepCard number={4} title="Generate Your Pin Visual" subtitle="AI creates a stunning product image based on your angle and scene">
                  <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
                    {sceneInfo && <div className={cn("flex items-center gap-2 px-4 py-2 rounded-xl border w-fit text-xs font-bold", sceneInfo.color==="violet"?"bg-violet-50 border-violet-100 text-violet-700":"bg-rose-50 border-rose-100 text-rose-700")}><div className={cn("w-1.5 h-1.5 rounded-full animate-pulse",sceneInfo.color==="violet"?"bg-violet-500":"bg-rose-500")}/> Scene: {sceneInfo.label}</div>}
                    {imagesLeft<=0 ? (
                      <button onClick={()=>setShowUpgradeModal(true)} className="w-full py-5 bg-slate-100 border-2 border-dashed border-slate-300 text-slate-500 font-black text-lg rounded-[1.5rem] flex items-center justify-center gap-3 hover:border-rose-400 hover:text-rose-500 transition-all"><Lock size={20}/> Upgrade for More Images</button>
                    ) : (
                      <button onClick={generateImage} disabled={isGeneratingImage}
                        className="w-full py-5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xl rounded-[1.5rem] shadow-xl shadow-rose-100 transition-all flex items-center justify-center gap-3 hover:scale-[1.01] disabled:opacity-50 disabled:hover:scale-100">
                        {isGeneratingImage?<><Loader2 className="animate-spin" size={22}/>Generating...</>:<><Sparkles size={22}/>Generate AI Visual</>}
                      </button>
                    )}
                    <p className="text-center text-[10px] text-slate-400 font-medium uppercase tracking-widest">{imagesLeft} image{imagesLeft!==1?"s":""} remaining</p>
                    {selectedAngleIndex!==null && (
                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Headline for Overlay</p>
                        <div className="flex flex-wrap gap-2">{strategy.angles[selectedAngleIndex].headlines.map((h,i) => <button key={i} onClick={()=>setEditableHeadline(h)} className={cn("px-3 py-2 text-[10px] font-bold rounded-xl border transition-all",editableHeadline===h?"bg-rose-600 border-rose-600 text-white":"bg-white border-slate-100 text-slate-600 hover:border-rose-200")}>Var {i+1}</button>)}</div>
                      </div>
                    )}
                  </div>
                </StepCard>

                {/* Step 5 — Voiceover */}
                <StepCard number={5} title="Voiceover Script" subtitle="Optional — generate a ready-to-record script for your video pin" badge="Optional" dimmed={!generatedImage && !uploadedImage}>
                  <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-9 h-9 bg-rose-100 rounded-xl flex items-center justify-center text-rose-600"><Mic size={18}/></div>
                        <div><p className="font-black text-slate-900 text-sm">Auto-Generate Voiceover</p><p className="text-[11px] text-slate-400 font-medium">15-30 second script matched to your angle</p></div>
                      </div>
                      <div className="space-y-2 mb-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tone</p>
                        <div className="grid grid-cols-5 gap-2">
                          {VOICE_TONES.map(t => <button key={t.id} onClick={()=>setSelectedVoiceTone(t.id)} className={cn("flex flex-col items-center gap-1 p-2.5 rounded-2xl border-2 transition-all hover:scale-[1.03]",selectedVoiceTone===t.id?"border-rose-500 bg-rose-50":"border-slate-100 bg-slate-50 hover:border-rose-200")}><span className="text-base">{t.emoji}</span><p className={cn("text-[9px] font-black uppercase tracking-tight",selectedVoiceTone===t.id?"text-rose-700":"text-slate-500")}>{t.label}</p></button>)}
                        </div>
                        <p className="text-[11px] text-slate-400">{VOICE_TONES.find(t=>t.id===selectedVoiceTone)?.desc}</p>
                      </div>
                      <button onClick={generateVoiceover} disabled={isGeneratingVoiceover||selectedAngleIndex===null}
                        className="w-full py-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white font-black rounded-2xl transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50">
                        {isGeneratingVoiceover?<><Loader2 className="animate-spin" size={16}/>Writing Script...</>:<><FileText size={16}/>Generate Script</>}
                      </button>
                    </div>
                    <AnimatePresence>
                      {voiceoverScript && (
                        <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:"auto" }} exit={{ opacity:0, height:0 }}>
                          <div className="p-6 space-y-4">
                            <div className="flex items-center justify-between">
                              <button onClick={()=>setVoiceoverExpanded(!voiceoverExpanded)} className="flex items-center gap-2 text-slate-900 font-black text-sm"><Volume2 size={15} className="text-rose-500"/>Your Script{voiceoverExpanded?<ChevronUp size={13}/>:<ChevronDown size={13}/>}</button>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">≈ {voiceoverScript.duration}</span>
                                <button onClick={()=>copyToClipboard(voiceoverScript.script,"script")} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400">{copiedField==="script"?<Check size={14} className="text-emerald-500"/>:<Copy size={14}/>}</button>
                              </div>
                            </div>
                            {voiceoverExpanded && (
                              <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="space-y-4">
                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100"><p className="text-slate-700 text-sm leading-loose font-medium whitespace-pre-wrap">{voiceoverScript.script}</p></div>
                                {voiceoverScript.hooks?.length>0 && (
                                  <div className="space-y-2">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Play size={9}/> Alternative Hooks</p>
                                    {voiceoverScript.hooks.map((hook,i) => <div key={i} className="flex items-start gap-2 p-3 bg-white border border-slate-100 rounded-2xl group hover:border-rose-200 transition-all"><span className="text-[10px] font-black text-slate-300 mt-0.5 shrink-0">{i+1}</span><p className="text-xs text-slate-600 font-medium flex-1">{hook}</p><button onClick={()=>copyToClipboard(hook,`hook-${i}`)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-300 group-hover:text-slate-400">{copiedField===`hook-${i}`?<Check size={12} className="text-emerald-500"/>:<Copy size={12}/>}</button></div>)}
                                  </div>
                                )}
                                <button onClick={generateVoiceover} disabled={isGeneratingVoiceover} className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-2xl flex items-center justify-center gap-2 text-sm disabled:opacity-50"><RefreshCw size={14} className={isGeneratingVoiceover?"animate-spin":""}/>Regenerate</button>
                              </motion.div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </StepCard>

                {/* Step 6 — Animate & Export */}
                <StepCard number={6} title="Animate & Export" subtitle="Bring your pin to life as a video, then download" dimmed={!generatedImage && !uploadedImage}>
                  <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Animation Vibe</p>
                      <textarea className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs text-slate-600 focus:ring-2 focus:ring-rose-500 outline-none transition-all h-20 resize-none font-medium" value={animationPrompt} onChange={e=>setAnimationPrompt(e.target.value)} placeholder="Describe the motion style..."/>
                    </div>
                    <div className="space-y-3">
                      {(generatedImage||uploadedImage) && <button onClick={downloadImage} className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 hover:scale-[1.01]"><Download size={17}/>Download Pin Image</button>}
                      {videosLeft<=0 ? <button onClick={()=>setShowUpgradeModal(true)} className="w-full py-4 bg-slate-100 border-2 border-dashed border-slate-300 text-slate-500 font-black rounded-2xl flex items-center justify-center gap-2 hover:border-indigo-400 hover:text-indigo-500 transition-all"><Lock size={17}/>Upgrade for Video</button> :
                        (!animatedVideoUrl&&!isAnimating&&(generatedImage||uploadedImage)) ? <button onClick={animateImage} className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-2xl shadow-xl shadow-rose-100 transition-all flex items-center justify-center gap-2 hover:scale-[1.01]"><Zap size={17}/>Bring It To Life · {videosLeft} left</button> : null}
                      {animatedVideoUrl && <div className="space-y-3"><div className="aspect-video rounded-2xl overflow-hidden bg-slate-100 shadow-inner"><video src={animatedVideoUrl} className="w-full h-full object-cover" controls autoPlay loop muted/></div><button onClick={downloadVideo} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 transition-all flex items-center justify-center gap-2 hover:scale-[1.01]"><Download size={17}/>Download Video Pin</button></div>}
                      {isAnimating && <div className="flex items-center gap-3 justify-center py-4 bg-slate-50 rounded-2xl border border-slate-100"><Loader2 className="animate-spin text-rose-500" size={18}/><p className="text-sm font-bold text-slate-600">Animating... ~60-90 seconds</p></div>}
                    </div>
                  </div>
                </StepCard>

              </div>{/* end left col */}

              {/* Right: sticky preview */}
              <div className="lg:col-span-5 sticky top-24 space-y-5">
                <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-black text-slate-900">Pin Preview</h3>
                    {(generatedImage||uploadedImage) && <button onClick={generateImage} disabled={isGeneratingImage} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-rose-600 transition-all"><RefreshCw size={17} className={isGeneratingImage?"animate-spin":""}/></button>}
                  </div>
                  {(generatedImage||uploadedImage) ? (
                    <>
                      <div ref={previewRef} className="aspect-[2/3] bg-slate-100 rounded-[1.75rem] overflow-hidden relative cursor-crosshair touch-none shadow-2xl mx-auto max-w-[280px]"
                        onMouseMove={handleDrag} onTouchMove={handleDrag} onMouseUp={handleDragEnd} onTouchEnd={handleDragEnd}>
                        {isGeneratingImage ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-30"><Loader2 className="animate-spin text-rose-600 mb-3" size={36}/><p className="font-bold text-slate-900 text-sm">Crafting...</p></div>
                        ) : (
                          <>
                            <img src={generatedImage||uploadedImage||""} alt="Pin Preview" className="w-full h-full object-cover select-none" referrerPolicy="no-referrer" draggable={false}/>
                            <div className="absolute inset-0 p-3 flex flex-col justify-center items-center pointer-events-none" style={{transform:`translate(${overlayPosition.x}%,${overlayPosition.y}%) scale(${overlayScale})`}}>
                              <div className="bg-white/95 backdrop-blur-md p-3 rounded-xl border border-white/50 shadow-2xl max-w-[88%] pointer-events-auto cursor-move select-none active:scale-95 transition-transform" onMouseDown={handleDragStart} onTouchStart={handleDragStart}>
                                <p className="text-rose-600 font-black text-xs leading-tight mb-1 uppercase italic tracking-tight">{editableHeadline}</p>
                                <p className="text-slate-800 text-[8px] font-bold leading-tight line-clamp-2 mb-1.5">{editableSubtext}</p>
                                {socialProof && <div className="flex flex-wrap gap-1 mb-1.5">{(socialProof.stars||socialProof.reviews)&&<div className="flex items-center gap-1 bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-100"><Star size={7} fill="currentColor" className="text-amber-500"/><span className="text-[7px] font-black text-amber-700">{socialProof.stars?`${socialProof.stars} Star`:`${socialProof.reviews} Reviews`}</span></div>}{socialProof.sold&&<div className="flex items-center gap-1 bg-blue-50 px-1.5 py-0.5 rounded-md border border-blue-100"><span className="text-[7px] font-black text-blue-700 uppercase">{socialProof.sold}</span></div>}</div>}
                                <div className="inline-block px-2.5 py-1 bg-rose-600 text-white text-[8px] font-black rounded-full uppercase tracking-widest shadow-md shadow-rose-200">{editableCTA}</div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="mt-4 space-y-3">
                        <div className="flex justify-between items-center"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Overlay Size</p><span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">{Math.round(overlayScale*100)}%</span></div>
                        <input type="range" min="0.5" max="1.5" step="0.05" value={overlayScale} onChange={e=>setOverlayScale(parseFloat(e.target.value))} className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-rose-600"/>
                        <p className="text-[10px] text-slate-300 text-center">Drag the overlay to reposition</p>
                      </div>
                    </>
                  ) : (
                    <div className="aspect-[2/3] max-w-[280px] mx-auto bg-slate-50 border-2 border-dashed border-slate-200 rounded-[1.75rem] flex flex-col items-center justify-center gap-3 text-center p-6">
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm"><ImageIcon size={24} className="text-slate-200"/></div>
                      <div><p className="font-black text-slate-400 text-sm">Pin preview</p><p className="text-xs text-slate-300 mt-0.5">Complete steps 1–4</p></div>
                    </div>
                  )}
                </div>

                {/* Progress tracker */}
                <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Your Progress</p>
                  <div className="space-y-2.5">
                    {[
                      { label: "Viral Angle",       done: selectedAngleIndex!==null },
                      { label: "Product Photo",      done: !!uploadedImage },
                      { label: "Copy & SEO",         done: !!editableHeadline },
                      { label: "AI Visual",          done: !!generatedImage },
                      { label: "Voiceover Script",   done: !!voiceoverScript, optional: true },
                      { label: "Animate / Export",   done: !!animatedVideoUrl, optional: true },
                    ].map(step => (
                      <div key={step.label} className="flex items-center gap-3">
                        <div className={cn("w-5 h-5 rounded-full flex items-center justify-center shrink-0",step.done?"bg-emerald-500":"bg-slate-100 border-2 border-slate-200")}>{step.done&&<Check size={10} className="text-white"/>}</div>
                        <p className={cn("text-xs font-bold",step.done?"text-slate-700":"text-slate-400")}>{step.label}{step.optional&&<span className="ml-1.5 text-[9px] font-medium text-slate-300 uppercase">optional</span>}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Empty state */}
        {!strategy && !isLoading && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            <FeatureCard icon={<Zap className="text-rose-500"/>}        title="Viral Psychology"     desc="Proven impulse-buy triggers that get your pins saved."/>
            <FeatureCard icon={<Shuffle className="text-violet-500"/>}  title="5 Auto Scene Options" desc="Upload once — AI places your product in 5 stunning different scenes."/>
            <FeatureCard icon={<Mic className="text-rose-500"/>}        title="Voiceover Scripts"    desc="Get a ready-to-record script matched to your pin's tone and angle."/>
          </motion.div>
        )}

        {/* Pricing section */}
        <section id="pricing-section" className="py-24 border-t border-slate-100">
          <div className="max-w-6xl mx-auto">
            <div className="text-center max-w-3xl mx-auto mb-12">
              <h2 className="text-3xl md:text-5xl font-black text-slate-900 mb-5 tracking-tight leading-tight">
                Turn Products Into Viral Content — <span className="text-rose-600">Without Designers</span>
              </h2>
              <p className="text-lg text-slate-600 mb-6">High-converting Pinterest visuals in seconds.</p>

              {/* Stripe status notice */}
              {!stripeConfig.isSetup && (
                <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
                  className="inline-flex items-center gap-3 px-5 py-3 bg-amber-50 border border-amber-200 rounded-2xl mb-6">
                  <CreditCard size={16} className="text-amber-600"/>
                  <p className="text-sm text-amber-700 font-medium">Connect Stripe to activate checkout</p>
                  <button onClick={()=>setShowStripeSetup(true)} className="px-3 py-1.5 bg-amber-600 text-white text-xs font-bold rounded-xl hover:bg-amber-700 transition-all">Setup Stripe</button>
                </motion.div>
              )}
              {stripeConfig.isSetup && (
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-2xl mb-6">
                  <ShieldCheck size={15} className="text-emerald-600"/>
                  <p className="text-sm text-emerald-700 font-medium">Stripe connected · Test mode active</p>
                </div>
              )}

              {/* Billing toggle */}
              <div className="flex justify-center">
                <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-2xl">
                  {(["monthly","annual"] as const).map(c => (
                    <button key={c} onClick={()=>setBillingCycle(c)}
                      className={cn("px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",billingCycle===c?"bg-white shadow text-slate-900":"text-slate-500 hover:text-slate-700")}>
                      {c.charAt(0).toUpperCase()+c.slice(1)}
                      {c==="annual"&&<span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded-full uppercase">Save 30%</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-16">
              {(["starter","pro","scale","agency"] as const).map(key => <PricingCard key={key} planKey={key}/>)}
            </div>

            {/* Top-up packs */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
              <div className="bg-slate-50 p-8 rounded-[32px] border border-slate-200">
                <div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 bg-rose-100 rounded-lg flex items-center justify-center text-rose-600"><Plus size={18}/></div><h3 className="text-xl font-bold text-slate-900">Top-up Packs</h3></div>
                <p className="text-slate-500 text-sm mb-5">Add to any plan, any time.</p>
                <div className="space-y-3">
                  {TOPUP_PACKS.map(p => {
                    const loading = checkoutLoading === p.key;
                    return (
                      <button key={p.key} onClick={()=>startCheckout("topup","monthly",p.key)} disabled={!!checkoutLoading}
                        className={cn("w-full flex items-center justify-between p-3 bg-white rounded-xl border transition-all hover:scale-[1.01] disabled:opacity-60",p.highlight?"border-rose-200 shadow-sm":"border-slate-100 hover:border-rose-200")}>
                        <span className="text-sm font-medium text-slate-700">{p.label}{p.highlight&&<span className="text-[10px] text-rose-500 font-bold ml-2">Best Value</span>}</span>
                        <div className="flex items-center gap-2">{loading?<Loader2 size={14} className="animate-spin text-rose-500"/>:null}<span className="text-base font-black text-rose-600">${p.price}</span></div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white p-8 rounded-[32px] border border-slate-200 flex flex-col justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Free Plan</h3>
                  <p className="text-slate-500 text-sm mb-5">Try before you commit. No credit card required.</p>
                  <ul className="space-y-2 mb-5">
                    {["3 AI image generations","5 auto scene environments","Pinterest strategy generator","Voiceover script generator","No credit card needed"].map((f,i) => <li key={i} className="flex items-center gap-2 text-sm text-slate-600"><Check size={15} className="text-emerald-500"/>{f}</li>)}
                    <li className="flex items-center gap-2 text-sm text-slate-400"><AlertCircle size={15} className="text-amber-400"/>Videos require a paid plan</li>
                  </ul>
                </div>
                <button className="w-full px-8 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-2xl transition-all flex items-center justify-center gap-2">Try for Free <ArrowRight size={16}/></button>
              </div>
            </div>

            <div className="text-center">
              <p className="text-xl md:text-2xl font-bold text-slate-400 italic">"Create scroll-stopping content at scale — <span className="text-slate-900">without hiring designers or editors.</span>"</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-12 bg-white">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-3"><div className="w-6 h-6 bg-rose-600 rounded flex items-center justify-center text-white"><Sparkles size={13}/></div><span className="font-bold text-slate-800">PinViral</span></div>
          <p className="text-slate-400 text-sm">Built for e-commerce brands and lifestyle creators. © 2026 PinViral AI.</p>
          <p className="text-slate-300 text-xs mt-1">Stripe payments in test mode · No real charges</p>
        </div>
      </footer>

      {/* Modals */}
      <AnimatePresence>{showStripeSetup && <StripeSetupModal/>}</AnimatePresence>
      <AnimatePresence>{showUpgradeModal && <UpgradeModal/>}</AnimatePresence>

      <AnimatePresence>
        {isAnimating && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-white/80 backdrop-blur-md">
            <div className="text-center space-y-4">
              <div className="relative w-20 h-20 mx-auto"><div className="absolute inset-0 border-4 border-rose-100 rounded-full"/><div className="absolute inset-0 border-4 border-rose-600 rounded-full border-t-transparent animate-spin"/><div className="absolute inset-0 flex items-center justify-center text-rose-600"><Wand2 size={30} className="animate-pulse"/></div></div>
              <div><h4 className="text-lg font-bold text-slate-900">Creating Magic...</h4><p className="text-slate-500 text-sm">~60–90 seconds</p></div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
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
