/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ── .env variables expected ────────────────────────────────────────────────
 *  STRIPE_SECRET_KEY=sk_test_...
 *  STRIPE_PUBLISHABLE_KEY=pk_test_...
 *  STRIPE_PRICE_STARTER_MONTHLY=price_...   (optional — auto-created if absent)
 *  STRIPE_PRICE_STARTER_ANNUAL=price_...
 *  STRIPE_PRICE_PRO_MONTHLY=price_...
 *  STRIPE_PRICE_PRO_ANNUAL=price_...
 *  STRIPE_PRICE_SCALE_MONTHLY=price_...
 *  STRIPE_PRICE_SCALE_ANNUAL=price_...
 *  STRIPE_PRICE_AGENCY_MONTHLY=price_...
 *  STRIPE_PRICE_AGENCY_ANNUAL=price_...
 *  STRIPE_PRICE_TOPUP_50IMG=price_...
 *  STRIPE_PRICE_TOPUP_10VID=price_...
 *  STRIPE_PRICE_TOPUP_BUNDLE_S=price_...
 *  STRIPE_PRICE_TOPUP_BUNDLE_M=price_...
 *  STRIPE_PRICE_TOPUP_BUNDLE_L=price_...
 *  API_KEY=...  or  GEMINI_API_KEY=...
 * ──────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { GoogleGenAI, Type } from "@google/genai";
import { toPng } from "html-to-image";
import {
  Sparkles, Copy, Check, Image as ImageIcon, Loader2, ArrowRight,
  Upload, Download, RefreshCw, Zap, Search, Video, ExternalLink,
  Wand2, AlertCircle, Star, Plus, Hash, Accessibility, TrendingUp,
  Lock, Shuffle, Sun, Moon, Leaf, Home, Camera, Droplets, MapPin,
  Eye, Mic, Volume2, FileText, ChevronDown, ChevronUp, Play,
  CreditCard, X, ShieldCheck, CheckCircle2, Key, Settings,
  User, LogOut, Crown, BarChart2, RefreshCcw, ExternalLink as Portal,
  Gift, Zap as Flash
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

declare global {
  interface Window {
    aistudio?: { hasSelectedApiKey: () => Promise<boolean>; openSelectKey: () => Promise<void>; };
  }
}

function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, initialDelay = 2000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try { return await fn(); } catch (err: any) {
      lastError = err;
      const msg = err.message || String(err);
      if (!(msg.includes("503") || msg.includes("429") || msg.includes("UNAVAILABLE")) || i === maxRetries - 1) break;
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

// ── SaaS session (persisted to localStorage) ──────────────────────────────────
interface UserSession {
  plan: string;                  // "free" | "starter" | "pro" | "scale" | "agency"
  billing: "monthly" | "annual";
  imagesLeft: number;
  videosLeft: number;
  imagesTotal: number;
  videosTotal: number;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  activatedAt?: string;
  expiresAt?: string;            // ISO date of next renewal
  topupHistory: { date: string; label: string; amount: number }[];
}

interface StripePriceIds {
  starter_monthly: string; starter_annual: string;
  pro_monthly: string;     pro_annual: string;
  scale_monthly: string;   scale_annual: string;
  agency_monthly: string;  agency_annual: string;
  topup_50img: string;     topup_10vid: string;
  topup_bundle_s: string;  topup_bundle_m: string;
  topup_bundle_l: string;
}

interface StripeRuntime {
  secretKey: string; publishableKey: string;
  priceIds: Partial<StripePriceIds>;
  ready: boolean; keysPresent: boolean;
}

// ── Env reader ────────────────────────────────────────────────────────────────

function readEnv(key: string): string {
  // Vite (Vercel) exposes VITE_ vars via import.meta.env
  const vite = (typeof import.meta !== "undefined" && (import.meta as any).env)
    ? (import.meta as any).env as Record<string, string>
    : {} as Record<string, string>;
  // process.env fallback for AI Studio / Node / CRA
  const e = (typeof process !== "undefined" ? process.env : {}) as Record<string, string>;
  return (
    vite[`VITE_${key}`]   ||   // VITE_API_KEY  <- primary for Vercel builds
    vite[key]             ||   // bare name in vite env
    e[key]                ||   // process.env.API_KEY (AI Studio / Node)
    e[`VITE_${key}`]      ||   // process.env.VITE_API_KEY
    e[`REACT_APP_${key}`] ||   // CRA
    ""
  );
}

function readStripeFromEnv(): StripeRuntime {
  const secretKey = readEnv("STRIPE_SECRET_KEY");
  const publishableKey = readEnv("STRIPE_PUBLISHABLE_KEY");
  const priceIds: Partial<StripePriceIds> = {
    starter_monthly: readEnv("STRIPE_PRICE_STARTER_MONTHLY"),
    starter_annual:  readEnv("STRIPE_PRICE_STARTER_ANNUAL"),
    pro_monthly:     readEnv("STRIPE_PRICE_PRO_MONTHLY"),
    pro_annual:      readEnv("STRIPE_PRICE_PRO_ANNUAL"),
    scale_monthly:   readEnv("STRIPE_PRICE_SCALE_MONTHLY"),
    scale_annual:    readEnv("STRIPE_PRICE_SCALE_ANNUAL"),
    agency_monthly:  readEnv("STRIPE_PRICE_AGENCY_MONTHLY"),
    agency_annual:   readEnv("STRIPE_PRICE_AGENCY_ANNUAL"),
    topup_50img:     readEnv("STRIPE_PRICE_TOPUP_50IMG"),
    topup_10vid:     readEnv("STRIPE_PRICE_TOPUP_10VID"),
    topup_bundle_s:  readEnv("STRIPE_PRICE_TOPUP_BUNDLE_S"),
    topup_bundle_m:  readEnv("STRIPE_PRICE_TOPUP_BUNDLE_M"),
    topup_bundle_l:  readEnv("STRIPE_PRICE_TOPUP_BUNDLE_L"),
  };
  Object.keys(priceIds).forEach(k => { if (!(priceIds as any)[k]) delete (priceIds as any)[k]; });
  const keysPresent = !!(secretKey && publishableKey);
  const ready = keysPresent && Object.keys(priceIds).length === 13;
  return { secretKey, publishableKey, priceIds, ready, keysPresent };
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PLAN_DEFS: Record<string, {
  monthly: number; annual: number; images: number; videos: number;
  emoji: string; desc: string; features: string[]; bonus?: string; popular?: boolean; color: string;
}> = {
  free:    { monthly: 0,   annual: 0,   images: 3,    videos: 0,   emoji: "🎯", desc: "Try before you commit",          features: ["3 AI images","5 scene environments","Pinterest strategy","Voiceover scripts"], color: "slate" },
  starter: { monthly: 29,  annual: 20,  images: 50,   videos: 3,   emoji: "🌱", desc: "For beginners testing products", features: ["50 AI images/mo","3 video pins/mo","Pinterest strategy","5 auto scenes","Voiceover scripts"], color: "emerald" },
  pro:     { monthly: 59,  annual: 41,  images: 150,  videos: 15,  emoji: "⚡", desc: "For serious sellers & creators", features: ["150 AI images/mo","15 video pins/mo","Full strategy system","All scene environments","All voiceover tones","Faster generation"], bonus: "Best value for active sellers", popular: true, color: "rose" },
  scale:   { monthly: 119, annual: 83,  images: 400,  videos: 50,  emoji: "🚀", desc: "For power users & brands",       features: ["400 AI images/mo","50 video pins/mo","Everything in Pro","Extended animation","Priority processing"], color: "violet" },
  agency:  { monthly: 199, annual: 139, images: 1200, videos: 150, emoji: "👑", desc: "For agencies & white-label",     features: ["1,200 AI images/mo","150 video pins/mo","Everything in Scale","White-label exports","Team seats (5)","API access"], color: "indigo" },
};

const TOPUP_PACKS = [
  { key: "topup_50img",    label: "50 Images",              images: 50,  videos: 0,  price: 12, highlight: false },
  { key: "topup_10vid",    label: "10 Videos",              images: 0,   videos: 10, price: 19, highlight: false },
  { key: "topup_bundle_s", label: "50 Images + 5 Videos",   images: 50,  videos: 5,  price: 25, highlight: true  },
  { key: "topup_bundle_m", label: "100 Images + 15 Videos", images: 100, videos: 15, price: 49, highlight: false },
  { key: "topup_bundle_l", label: "250 Images + 40 Videos", images: 250, videos: 40, price: 99, highlight: false },
];

const VOICE_TONES: { id: VoiceTone; label: string; desc: string; emoji: string }[] = [
  { id: "energetic", label: "Energetic", desc: "High energy, exciting, action-driven",  emoji: "⚡" },
  { id: "calm",      label: "Calm",      desc: "Soft, reassuring, problem-solving",      emoji: "🧘" },
  { id: "luxury",    label: "Luxury",    desc: "Elegant, aspirational, premium feel",    emoji: "💎" },
  { id: "trendy",    label: "Trendy",    desc: "Gen Z, viral, conversational & fun",     emoji: "🔥" },
  { id: "asmr",      label: "ASMR",      desc: "Whispered, intimate, sensory detail",    emoji: "🎙️" },
];

const ENV_ICONS: Record<string, React.ReactNode> = {
  sun: <Sun size={14} />, moon: <Moon size={14} />, leaf: <Leaf size={14} />,
  home: <Home size={14} />, camera: <Camera size={14} />, droplets: <Droplets size={14} />,
  mappin: <MapPin size={14} />, sparkles: <Sparkles size={14} />,
};

const BASE_REALISTIC_MOTION = "Create subtle, realistic motion: slight camera zoom (Ken Burns effect), soft lighting movement, gentle shadow shift, no distortion of the product, keep product shape 100% accurate.";
const SESSION_KEY   = "pinviral_session_v2";
const STRIPE_SK_KEY = "pinviral_stripe_sk";
const STRIPE_PX_KEY = "pinviral_stripe_px";

// ── Default session ───────────────────────────────────────────────────────────

const defaultSession = (): UserSession => ({
  plan: "free", billing: "monthly",
  imagesLeft: 3, videosLeft: 0, imagesTotal: 3, videosTotal: 0,
  topupHistory: [],
});

// ── Stripe REST helpers ───────────────────────────────────────────────────────

async function stripePost(sk: string, endpoint: string, params: Record<string, string>) {
  const res = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${sk}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe error ${res.status}`);
  return data;
}

async function stripeGet(sk: string, endpoint: string, params?: Record<string, string>) {
  const url = new URL(`https://api.stripe.com/v1/${endpoint}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: { "Authorization": `Bearer ${sk}` } });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe error ${res.status}`);
  return data;
}

// ── StepCard ──────────────────────────────────────────────────────────────────

function StepCard({ number, title, subtitle, badge, children, dimmed = false }:
  { number: number; title: string; subtitle?: string; badge?: string; children: React.ReactNode; dimmed?: boolean }) {
  return (
    <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: dimmed ? 0.38 : 1, y: 0 }}
      transition={{ delay: number * 0.05 }} className={cn(dimmed && "pointer-events-none select-none")}>
      <div className="flex items-center gap-3 mb-5">
        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shadow-lg shrink-0",
          number === 1 ? "bg-rose-600 text-white shadow-rose-200" : "bg-slate-900 text-white")}>{number}</div>
        <div>
          <h3 className="text-xl font-black text-slate-900 tracking-tight leading-none">{title}</h3>
          {subtitle && <p className="text-xs text-slate-400 font-medium mt-0.5">{subtitle}</p>}
        </div>
        {badge && <span className="ml-auto px-3 py-1 bg-rose-50 text-rose-600 text-[10px] font-black rounded-full uppercase tracking-tighter border border-rose-100 shrink-0">{badge}</span>}
      </div>
      <div className="ml-[52px]">{children}</div>
    </motion.section>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  // SaaS session
  const [session, setSession]                               = useState<UserSession>(defaultSession());
  // AI / app state
  const [productName, setProductName]                       = useState("");
  const [isLoading, setIsLoading]                           = useState(false);
  const [isGeneratingImage, setIsGeneratingImage]           = useState(false);
  const [isAnimating, setIsAnimating]                       = useState(false);
  const [isAnalyzingProduct, setIsAnalyzingProduct]         = useState(false);
  const [isAnalyzingSocialProof, setIsAnalyzingSocialProof] = useState(false);
  const [animatedVideoUrl, setAnimatedVideoUrl]             = useState<string | null>(null);
  const [lastVideoOperation, setLastVideoOperation]         = useState<any>(null);
  const [isExtending, setIsExtending]                       = useState(false);
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
  const [productAnalysis, setProductAnalysis]               = useState<ProductAnalysis | null>(null);
  const [selectedEnvId, setSelectedEnvId]                   = useState<string | null>(null);
  const [customEnvPrompt, setCustomEnvPrompt]               = useState("");
  const [showCustomEnv, setShowCustomEnv]                   = useState(false);
  const [analysisError, setAnalysisError]                   = useState<string | null>(null);
  const [voiceoverScript, setVoiceoverScript]               = useState<VoiceoverScript | null>(null);
  const [isGeneratingVoiceover, setIsGeneratingVoiceover]   = useState(false);
  const [selectedVoiceTone, setSelectedVoiceTone]           = useState<VoiceTone>("energetic");
  const [voiceoverExpanded, setVoiceoverExpanded]           = useState(true);
  // UI modals
  const [showUpgradeModal, setShowUpgradeModal]             = useState(false);
  const [showAccountModal, setShowAccountModal]             = useState(false);
  const [showStripeSetup, setShowStripeSetup]               = useState(false);
  // Stripe
  const [stripe, setStripe]                                 = useState<StripeRuntime>({ secretKey: "", publishableKey: "", priceIds: {}, ready: false, keysPresent: false });
  const [checkoutLoading, setCheckoutLoading]               = useState<string | null>(null);
  const [portalLoading, setPortalLoading]                   = useState(false);
  const [paymentToast, setPaymentToast]                     = useState<{ type: "success"|"error"; message: string } | null>(null);
  const [isCreatingPrices, setIsCreatingPrices]             = useState(false);
  const [creationLog, setCreationLog]                       = useState<string[]>([]);
  const [creationError, setCreationError]                   = useState<string | null>(null);
  const [manualSk, setManualSk]                             = useState("");
  const [manualPk, setManualPk]                             = useState("");

  const previewRef = useRef<HTMLDivElement>(null);

  // ── Persist session ───────────────────────────────────────────────────────

  const saveSession = useCallback((s: UserSession) => {
    setSession(s);
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {}
  }, []);

  const consumeImage = () => {
    setSession(prev => {
      const updated = { ...prev, imagesLeft: Math.max(0, prev.imagesLeft - 1) };
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  };

  const consumeVideo = () => {
    setSession(prev => {
      const updated = { ...prev, videosLeft: Math.max(0, prev.videosLeft - 1) };
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  };

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    checkApiKey();

    // Restore session
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) setSession(JSON.parse(raw));
    } catch {}

    // Load Stripe
    const envStripe = readStripeFromEnv();
    let merged = { ...envStripe };
    try {
      const sk = localStorage.getItem(STRIPE_SK_KEY);
      const pk = localStorage.getItem(STRIPE_PX_KEY);
      const savedPrices = JSON.parse(localStorage.getItem("pinviral_prices") || "{}");
      if (!merged.secretKey && sk) merged.secretKey = sk;
      if (!merged.publishableKey && pk) merged.publishableKey = pk;
      merged.priceIds = { ...savedPrices, ...merged.priceIds };
      merged.keysPresent = !!(merged.secretKey && merged.publishableKey);
      merged.ready = merged.keysPresent && Object.keys(merged.priceIds).length === 13;
    } catch {}
    setStripe(merged);
    if (merged.secretKey) setManualSk(merged.secretKey);
    if (merged.publishableKey) setManualPk(merged.publishableKey);

    // Handle Stripe redirect
    const params  = new URLSearchParams(window.location.search);
    const session_id = params.get("session_id");
    const plan       = params.get("plan");
    const billing    = params.get("billing") as "monthly"|"annual" || "monthly";
    const canceled   = params.get("canceled");
    const customer   = params.get("customer_id");
    const sub        = params.get("sub_id");
    const topup      = params.get("topup");

    if (session_id && plan && !canceled) {
      activatePlan(plan, billing, customer, sub, topup || undefined);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (canceled) {
      showToast("error", "Payment was canceled. No charges made.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (productUrl.length > 8 && !isAnalyzingSocialProof && !socialProof) fetchSocialProof(null, productUrl);
    }, 2000);
    return () => clearTimeout(t);
  }, [productUrl]);

  useEffect(() => {
    if (session.imagesLeft <= 2 && session.imagesLeft > 0 && session.plan === "free") setShowUpgradeModal(true);
  }, [session.imagesLeft]);

  // ── Toast helper ──────────────────────────────────────────────────────────

  const showToast = (type: "success"|"error", message: string) => {
    setPaymentToast({ type, message });
    setTimeout(() => setPaymentToast(null), 5000);
  };

  // ── Plan activation ───────────────────────────────────────────────────────

  const activatePlan = (planKey: string, billing: "monthly"|"annual", customerId?: string | null, subId?: string | null, topupKey?: string) => {

    // ── Top-up path ───────────────────────────────────────────────────────
    // topupKey is present when the user bought a credit pack (not a plan upgrade).
    // planKey will be "topup" in this case — it is NOT in PLAN_DEFS intentionally.
    if (topupKey) {
      const pack = TOPUP_PACKS.find(p => p.key === topupKey);
      if (!pack) { showToast("error", "Top-up pack not recognised. Contact support."); return; }

      setSession(prev => {
        const updated: UserSession = {
          ...prev,
          imagesLeft: prev.imagesLeft + pack.images,
          videosLeft: prev.videosLeft + pack.videos,
          topupHistory: [
            { date: new Date().toISOString(), label: pack.label, amount: pack.price },
            ...prev.topupHistory.slice(0, 9),
          ],
        };
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(updated)); } catch {}
        return updated;
      });

      showToast("success", `✓ ${pack.label} added! Credits updated.`);
      return;
    }

    // ── Subscription plan upgrade path ───────────────────────────────────
    const plan = PLAN_DEFS[planKey];
    if (!plan) { showToast("error", `Unknown plan: ${planKey}`); return; }

    setSession(prev => {
      const now   = new Date();
      const renew = new Date(now);
      if (billing === "annual") renew.setFullYear(renew.getFullYear() + 1);
      else renew.setMonth(renew.getMonth() + 1);

      const updated: UserSession = {
        ...prev,
        plan: planKey,
        billing,
        imagesLeft: plan.images,
        videosLeft: plan.videos,
        imagesTotal: plan.images,
        videosTotal: plan.videos,
        activatedAt: now.toISOString(),
        expiresAt: renew.toISOString(),
        stripeCustomerId: customerId || prev.stripeCustomerId,
        stripeSubscriptionId: subId || prev.stripeSubscriptionId,
      };
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });

    showToast("success", `≡ƒÄë ${plan.emoji} ${planKey.charAt(0).toUpperCase()+planKey.slice(1)} plan activated!`);
  };

  // ── Stripe Checkout ───────────────────────────────────────────────────────

  const startCheckout = async (planKey: string, billing: "monthly"|"annual" = "monthly", topupKey?: string) => {
    if (!stripe.keysPresent || !stripe.ready) {
      setShowStripeSetup(true);
      return;
    }

    const lk = topupKey || `${planKey}_${billing}`;
    setCheckoutLoading(lk);
    setError(null);

    try {
      const priceIdKey = (topupKey || `${planKey}_${billing}`) as keyof StripePriceIds;
      const priceId = stripe.priceIds[priceIdKey];
      if (!priceId) throw new Error(`Price ID for "${priceIdKey}" not found. Open Stripe setup to auto-create.`);

      const isSubscription = !topupKey;
      const base = window.location.href.split("?")[0];
      const successUrl = `${base}?session_id={CHECKOUT_SESSION_ID}&plan=${planKey}&billing=${billing}${topupKey ? `&topup=${topupKey}` : ""}`;
      const cancelUrl  = `${base}?canceled=1`;

      const sessionParams: Record<string, string> = {
        "payment_method_types[]": "card",
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": "1",
        success_url: successUrl,
        cancel_url: cancelUrl,
        mode: isSubscription ? "subscription" : "payment",
      };

      // Pre-fill email if customer exists
      if (session.stripeCustomerId) sessionParams["customer"] = session.stripeCustomerId;

      const checkoutSession = await stripePost(stripe.secretKey, "checkout/sessions", sessionParams);
      window.location.href = checkoutSession.url;
    } catch (err: any) {
      setError(`Checkout error: ${err.message}`);
      setCheckoutLoading(null);
    }
  };

  // ── Stripe Customer Portal ────────────────────────────────────────────────

  const openBillingPortal = async () => {
    if (!stripe.keysPresent) { setShowStripeSetup(true); return; }
    if (!session.stripeCustomerId) {
      showToast("error", "No customer record found. Please contact support.");
      return;
    }
    setPortalLoading(true);
    try {
      const portalSession = await stripePost(stripe.secretKey, "billing_portal/sessions", {
        customer: session.stripeCustomerId,
        return_url: window.location.href,
      });
      window.location.href = portalSession.url;
    } catch (err: any) {
      showToast("error", `Portal error: ${err.message}`);
    } finally {
      setPortalLoading(false);
    }
  };

  // ── Auto-create Stripe prices ─────────────────────────────────────────────

  const autoCreatePrices = async () => {
    if (!stripe.keysPresent) return;
    setIsCreatingPrices(true);
    setCreationLog([]);
    setCreationError(null);
    const log = (msg: string) => setCreationLog(p => [...p, msg]);
    const newIds: Partial<StripePriceIds> = { ...stripe.priceIds };

    try {
      const plans = [
        { key:"starter", name:"PinViral Starter", monthly:2900,  annual:24000  },
        { key:"pro",     name:"PinViral Pro",     monthly:5900,  annual:49200  },
        { key:"scale",   name:"PinViral Scale",   monthly:11900, annual:99600  },
        { key:"agency",  name:"PinViral Agency",  monthly:19900, annual:166800 },
      ];

      for (const p of plans) {
        const mk = `${p.key}_monthly` as keyof StripePriceIds;
        const ak = `${p.key}_annual`  as keyof StripePriceIds;
        if (newIds[mk] && newIds[ak]) { log(`✓ ${p.name} — already in .env`); continue; }
        log(`Creating ${p.name}...`);
        const prod = await stripePost(stripe.secretKey, "products", { name: p.name, "metadata[plan]": p.key });
        if (!newIds[mk]) { const mp = await stripePost(stripe.secretKey, "prices", { product:prod.id, unit_amount:String(p.monthly), currency:"usd", "recurring[interval]":"month", "metadata[plan]":p.key }); (newIds as any)[mk]=mp.id; log(`  ✓ Monthly: ${mp.id}`); }
        if (!newIds[ak]) { const ap = await stripePost(stripe.secretKey, "prices", { product:prod.id, unit_amount:String(p.annual),  currency:"usd", "recurring[interval]":"year",  "metadata[plan]":p.key }); (newIds as any)[ak]=ap.id; log(`  ✓ Annual:  ${ap.id}`); }
      }

      const topups = [
        { key:"topup_50img",    name:"PinViral Top-up: 50 Images",              amount:1200 },
        { key:"topup_10vid",    name:"PinViral Top-up: 10 Videos",              amount:1900 },
        { key:"topup_bundle_s", name:"PinViral Top-up: 50 Images + 5 Videos",   amount:2500 },
        { key:"topup_bundle_m", name:"PinViral Top-up: 100 Images + 15 Videos", amount:4900 },
        { key:"topup_bundle_l", name:"PinViral Top-up: 250 Images + 40 Videos", amount:9900 },
      ];

      log("Creating top-up packs...");
      for (const t of topups) {
        const tk = t.key as keyof StripePriceIds;
        if (newIds[tk]) { log(`  ✓ ${t.name} — already in .env`); continue; }
        const prod = await stripePost(stripe.secretKey, "products", { name:t.name, "metadata[type]":"topup" });
        const pr   = await stripePost(stripe.secretKey, "prices",   { product:prod.id, unit_amount:String(t.amount), currency:"usd" });
        (newIds as any)[tk] = pr.id;
        log(`  ✓ ${t.name}: ${pr.id}`);
      }

      const allReady = Object.keys(newIds).length === 13;
      const updated  = { ...stripe, priceIds: newIds, ready: allReady };
      setStripe(updated);
      try { localStorage.setItem("pinviral_prices", JSON.stringify(newIds)); } catch {}
      log(""); log("All done! Copy these to your .env:");
      Object.entries(newIds).forEach(([k, v]) => log(`  STRIPE_PRICE_${k.toUpperCase()}=${v}`));
    } catch (err: any) {
      setCreationError(err.message || "Failed to create prices.");
    } finally {
      setIsCreatingPrices(false);
    }
  };

  const saveManualKeys = () => {
    if (!manualSk || !manualPk) return;
    try { localStorage.setItem(STRIPE_SK_KEY, manualSk); localStorage.setItem(STRIPE_PX_KEY, manualPk); } catch {}
    const savedPrices = JSON.parse(localStorage.getItem("pinviral_prices") || "{}");
    const updated: StripeRuntime = { secretKey: manualSk, publishableKey: manualPk, priceIds: { ...savedPrices, ...stripe.priceIds }, keysPresent: true, ready: Object.keys({ ...savedPrices, ...stripe.priceIds }).length === 13 };
    setStripe(updated);
  };

  // ── AI helpers ────────────────────────────────────────────────────────────

  const getAI = () => {
    const k = readEnv("API_KEY") || readEnv("GEMINI_API_KEY");
    if (!k) throw new Error("API_KEY_MISSING");
    return new GoogleGenAI({ apiKey: k });
  };

  const handleApiError = (err: any, fallback: string) => {
    const msg = err?.message || String(err);
    if (msg.includes("API_KEY_MISSING")) { setError("No AI API key found in .env."); openKeyDialog(); return; }
    if (msg.includes("403") || msg.includes("PERMISSION_DENIED")) { setError("AI API permission denied. Check your key."); openKeyDialog(); return; }
    setError(fallback || msg);
  };

  const checkApiKey = async () => { if (window.aistudio?.hasSelectedApiKey) setHasApiKey(await window.aistudio.hasSelectedApiKey()); };
  const openKeyDialog = async () => { if (window.aistudio?.openSelectKey) { await window.aistudio.openSelectKey(); setHasApiKey(true); } };

  const selectAngle = (i: number, angle: ViralAngle) => {
    setSelectedAngleIndex(i);
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
      const prompt = `Pinterest viral growth expert. Create 3 high-converting Pinterest pin strategies for: "${productName}". Vibe: Professional, Aesthetic, Lifestyle. For each: Title, Hook, Viral Psychology, 5 Headlines, 3 Subtexts, CTA, SEO Description (Pinterest keyword-optimized), 10 Hashtags, Alt Text, Animation Prompt, AI Image Prompt (2:3 ratio).`;
      const schema = { responseMimeType:"application/json", responseSchema:{ type:Type.OBJECT, properties:{ angles:{ type:Type.ARRAY, items:{ type:Type.OBJECT, properties:{ title:{type:Type.STRING},hook:{type:Type.STRING},psychology:{type:Type.STRING},aiImagePrompt:{type:Type.STRING},headlines:{type:Type.ARRAY,items:{type:Type.STRING}},subtext:{type:Type.ARRAY,items:{type:Type.STRING}},cta:{type:Type.STRING},pinDescription:{type:Type.STRING},hashtags:{type:Type.ARRAY,items:{type:Type.STRING}},altText:{type:Type.STRING},animationPrompt:{type:Type.STRING}}, required:["title","hook","psychology","aiImagePrompt","headlines","subtext","cta","pinDescription","hashtags","altText","animationPrompt"] } } }, required:["angles"] } };
      let r: any;
      try { r = await withRetry(() => ai.models.generateContent({ model:"gemini-3-flash-preview", contents:prompt, config:schema })); }
      catch (e: any) { if (e.message?.includes("403")) r = await withRetry(() => ai.models.generateContent({ model:"gemini-flash-latest", contents:prompt, config:schema })); else throw e; }
      const data = JSON.parse((r as any).text || "{}") as PinStrategy;
      setStrategy(data);
      if (data.angles?.length > 0) selectAngle(0, data.angles[0]);
    } catch (err: any) { handleApiError(err, "Failed to generate strategy."); }
    finally { setIsLoading(false); }
  };

  const analyzeProductImage = async (imageData: string) => {
    setIsAnalyzingProduct(true); setAnalysisError(null); setProductAnalysis(null); setSelectedEnvId(null); setShowCustomEnv(false);
    try {
      const ai = getAI();
      const b64 = imageData.split(",")[1]; const mime = imageData.split(";")[0].split(":")[1];
      const prompt = `Analyze this product image. Return JSON only: { "productDescription":"one precise sentence", "keyVisualDetails":"comma-separated details that must never change", "environments":[ { "id":"env1","label":"2-3 words","icon":"sun|moon|leaf|home|camera|droplets|mappin|sparkles","mood":"one word","prompt":"Product photography: the exact same [product] — unchanged — placed in [50-80 word scene]..." } ...5 total ] }`;
      let r: any;
      try { r = await withRetry(() => ai.models.generateContent({ model:"gemini-3-flash-preview", contents:[{role:"user",parts:[{inlineData:{data:b64,mimeType:mime}},{text:prompt}]}], config:{responseMimeType:"application/json"} })); }
      catch (e: any) { if (e.message?.includes("403")) r = await withRetry(() => ai.models.generateContent({ model:"gemini-flash-latest", contents:[{role:"user",parts:[{inlineData:{data:b64,mimeType:mime}},{text:prompt}]}], config:{responseMimeType:"application/json"} })); else throw e; }
      const res = JSON.parse((r as any).text || "{}") as ProductAnalysis;
      setProductAnalysis(res);
      if (res.environments?.length > 0) setSelectedEnvId(res.environments[0].id);
    } catch { setAnalysisError("Could not analyze product. Write a custom scene below."); setShowCustomEnv(true); }
    finally { setIsAnalyzingProduct(false); }
  };

  const fetchSocialProof = async (imageData: string | null, url?: string) => {
    if (!imageData && !url) return;
    setIsAnalyzingSocialProof(true);
    try {
      const ai = getAI(); const parts: any[] = [];
      if (imageData?.startsWith("data:")) parts.push({ inlineData:{ data:imageData.split(",")[1], mimeType:imageData.split(";")[0].split(":")[1] } });
      const fu = url && !url.startsWith("http") ? `https://${url}` : url;
      parts.push({ text:`Analyze. ${fu?"URL: "+fu+". Use Google Search & URL Context.":""} Detect stars, reviews, sold. Return JSON: { hasSocialProof, stars, reviews, sold, suggestedHeadline, suggestedSubtext }` });
      const cfg: any = { responseMimeType:"application/json", tools:fu?[{googleSearch:{}},{urlContext:{}}]:undefined, toolConfig:fu?{includeServerSideToolInvocations:true}:undefined };
      let r: any;
      try { r = await withRetry(() => ai.models.generateContent({ model:"gemini-3-flash-preview", contents:[{role:"user",parts}], config:cfg })); }
      catch (e: any) { if (e.message?.includes("403")) r = await withRetry(() => ai.models.generateContent({ model:"gemini-flash-latest", contents:[{role:"user",parts}], config:cfg })); else throw e; }
      const res = JSON.parse((r as any).text || "{}");
      if (res.hasSocialProof) {
        setSocialProof({ stars:res.stars, reviews:res.reviews, sold:res.sold });
        if (res.suggestedHeadline) setEditableHeadline(res.suggestedHeadline);
        if (res.suggestedSubtext)  setEditableSubtext(res.suggestedSubtext);
      }
    } catch {} finally { setIsAnalyzingSocialProof(false); }
  };

  const buildPrompt = () => {
    if (showCustomEnv && customEnvPrompt.trim()) return customEnvPrompt.trim();
    if (productAnalysis && selectedEnvId) { const e = productAnalysis.environments.find(e=>e.id===selectedEnvId); if (e) return e.prompt; }
    if (strategy && selectedAngleIndex !== null) return strategy.angles[selectedAngleIndex].aiImagePrompt;
    return `High-quality Pinterest product photography for ${productName||"the product"}.`;
  };

  const generateImage = async () => {
    if (!strategy && !uploadedImage) return;
    if (session.imagesLeft <= 0) { setShowUpgradeModal(true); return; }
    setIsGeneratingImage(true); setError(null);
    try {
      const ai = getAI(); const prompt = buildPrompt(); const parts: any[] = [];
      if (uploadedImage?.startsWith("data:")) parts.push({ inlineData:{ data:uploadedImage.split(",")[1], mimeType:uploadedImage.split(";")[0].split(":")[1] } });
      const kd = productAnalysis?.keyVisualDetails||""; const pd = productAnalysis?.productDescription||productName||"the product";
      parts.push({ text: uploadedImage ? `Reference product image above. CRITICAL: Output product IDENTICAL — same color, shape, branding. ONLY change background/setting/lighting. ${kd?"Preserve: "+kd+".":""} Product: ${pd}. Scene: ${prompt}. Output: 2:3 ratio, professional Pinterest photography.` : `2:3 Pinterest pin. Product: ${pd}. Scene: ${prompt}. Style: ${strategy&&selectedAngleIndex!==null?strategy.angles[selectedAngleIndex].psychology:"professional lifestyle photography"}.` });
      let r: any;
      try { r = await withRetry(() => ai.models.generateContent({ model:"gemini-3.1-flash-image-preview", contents:{parts}, config:{imageConfig:{aspectRatio:"2:3",imageSize:"1K"}} })); }
      catch (e: any) { if (e.message?.includes("403")) r = await withRetry(() => ai.models.generateContent({ model:"gemini-2.5-flash-image", contents:{parts}, config:{imageConfig:{aspectRatio:"2:3"}} })); else throw e; }
      for (const p of r.candidates?.[0]?.content?.parts||[]) {
        if (p.inlineData) { setGeneratedImage(`data:image/png;base64,${p.inlineData.data}`); consumeImage(); return; }
      }
      throw new Error("No image returned. Please try again.");
    } catch (err: any) { handleApiError(err, "Failed to generate image."); }
    finally { setIsGeneratingImage(false); }
  };

  const generateVoiceover = async () => {
    if (!strategy || selectedAngleIndex===null) return;
    setIsGeneratingVoiceover(true);
    try {
      const ai = getAI(); const angle = strategy.angles[selectedAngleIndex];
      const prompt = `${selectedVoiceTone.toUpperCase()} Pinterest video voiceover (15-30 sec). Product: ${productName}. Angle: ${angle.title}. Psychology: ${angle.psychology}. Headline: ${editableHeadline}. Benefit: ${editableSubtext}. CTA: ${editableCTA}. ${socialProof?.stars?"Stars: "+socialProof.stars:""} Return JSON: { "tone":"${selectedVoiceTone}", "duration":"est read time", "script":"full script with \\n breaks and (pause) markers, 40-80 words", "hooks":["3 alternative opening lines"] }`;
      let r: any;
      try { r = await withRetry(() => ai.models.generateContent({ model:"gemini-3-flash-preview", contents:prompt, config:{responseMimeType:"application/json"} })); }
      catch (e: any) { if (e.message?.includes("403")) r = await withRetry(() => ai.models.generateContent({ model:"gemini-flash-latest", contents:prompt, config:{responseMimeType:"application/json"} })); else throw e; }
      setVoiceoverScript(JSON.parse((r as any).text||"{}"));
      setVoiceoverExpanded(true);
    } catch (err: any) { handleApiError(err, "Failed to generate voiceover."); }
    finally { setIsGeneratingVoiceover(false); }
  };

  const animateImage = async () => {
    const src = generatedImage||uploadedImage; if (!src) return;
    if (session.videosLeft <= 0) { setShowUpgradeModal(true); return; }

    // Resolve API key — prefer .env, fall back to aistudio dialog
    const apiKey = readEnv("API_KEY") || readEnv("GEMINI_API_KEY");
    if (!apiKey) {
      // Only open the aistudio key picker if there is truly no key anywhere
      if (window.aistudio?.openSelectKey) await window.aistudio.openSelectKey();
      else setError("No API key found. Add API_KEY to your .env file.");
      return;
    }

    setIsAnimating(true); setError(null); setAnimatedVideoUrl(null);
    try {
      const videoAi = new GoogleGenAI({ apiKey });
      const b64=src.split(",")[1]; const mime=src.split(";")[0].split(":")[1];
      const fp=`${BASE_REALISTIC_MOTION} ${animationPrompt||`Animate: ${selectedAngleIndex!==null?strategy?.angles[selectedAngleIndex]?.psychology:productName}. Smooth aesthetic motion.`}`;
      let op = await withRetry(() => videoAi.models.generateVideos({ model:"veo-3.1-lite-generate-preview", prompt:fp, image:{imageBytes:b64,mimeType:mime}, config:{numberOfVideos:1,resolution:"720p",aspectRatio:"9:16"} }));
      let polls=0;
      while (!op.done&&polls<60) { await new Promise(r=>setTimeout(r,10000)); op=await withRetry(()=>videoAi.operations.getVideosOperation({operation:op})); polls++; }
      let sf=0;
      while (op.done&&!op.response&&!op.error&&sf<3) { await new Promise(r=>setTimeout(r,5000)); op=await withRetry(()=>videoAi.operations.getVideosOperation({operation:op})); sf++; }
      if (op.error) throw new Error(op.error.message);
      const link=op.response?.generatedVideos?.[0]?.video?.uri;
      if (link) { const res=await fetch(link,{headers:{"x-goog-api-key":apiKey}}); if (!res.ok) throw new Error("Download failed"); setLastVideoOperation(op); setAnimatedVideoUrl(URL.createObjectURL(await res.blob())); consumeVideo(); }
      else throw new Error("No video URL returned.");
    } catch (err: any) { handleApiError(err, "Failed to animate."); }
    finally { setIsAnimating(false); }
  };

  const extendVideo = async () => {
    if (!lastVideoOperation?.response?.generatedVideos?.[0]?.video) return;
    if (session.videosLeft <= 0) { setShowUpgradeModal(true); return; }

    const apiKey = readEnv("API_KEY") || readEnv("GEMINI_API_KEY");
    if (!apiKey) { setError("No API key found. Add API_KEY to your .env file."); return; }

    setIsExtending(true); setError(null);
    try {
      const videoAi = new GoogleGenAI({ apiKey });
      const currentPsychology = selectedAngleIndex !== null ? strategy?.angles[selectedAngleIndex]?.psychology : "";
      const extendPrompt = `${BASE_REALISTIC_MOTION} Continue the cinematic motion seamlessly from where it left off. Keep the same product in focus, maintain realistic lighting and aesthetic lifestyle feel. ${currentPsychology || productName}`;

      let op = await withRetry(() =>
        videoAi.models.generateVideos({
          model: "veo-3.1-generate-preview",
          prompt: extendPrompt,
          video: lastVideoOperation.response.generatedVideos[0].video,
          config: { numberOfVideos: 1, resolution: "720p", aspectRatio: "9:16" },
        })
      );

      let polls = 0;
      while (!op.done && polls < 60) {
        await new Promise(r => setTimeout(r, 10000));
        op = await withRetry(() => videoAi.operations.getVideosOperation({ operation: op }));
        polls++;
      }
      let sf = 0;
      while (op.done && !op.response && !op.error && sf < 3) {
        await new Promise(r => setTimeout(r, 5000));
        op = await withRetry(() => videoAi.operations.getVideosOperation({ operation: op }));
        sf++;
      }

      if (op.error) throw new Error(op.error.message);
      if (!op.done)  throw new Error("Extension timed out. Please try again.");

      setLastVideoOperation(op);
      const link = op.response?.generatedVideos?.[0]?.video?.uri;
      if (link) {
        const res = await fetch(link, { headers: { "x-goog-api-key": apiKey } });
        if (!res.ok) throw new Error("Failed to download extended video.");
        setAnimatedVideoUrl(URL.createObjectURL(await res.blob()));
        consumeVideo(); // Each extension costs 1 video credit
      } else {
        throw new Error("No download link returned from extension.");
      }
    } catch (err: any) { handleApiError(err, "Failed to extend video."); }
    finally { setIsExtending(false); }
  };

  const downloadVideo = () => { if (!animatedVideoUrl) return; const a=document.createElement("a"); a.href=animatedVideoUrl; a.download=`pinviral-video-${productName.replace(/\s+/g,"-").toLowerCase()}.mp4`; document.body.appendChild(a); a.click(); document.body.removeChild(a); };
  const downloadImage = async () => { if (!previewRef.current) return; try { const url=await toPng(previewRef.current,{cacheBust:true,pixelRatio:2}); const a=document.createElement("a"); a.href=url; a.setAttribute("download",`pinviral-pin-${productName.replace(/\s+/g,"-").toLowerCase()||"design"}.png`); document.body.appendChild(a); a.click(); document.body.removeChild(a); } catch { setError("Download failed."); } };
  const copyToClipboard = (text: string, field: string) => { navigator.clipboard.writeText(text); setCopiedField(field); setTimeout(()=>setCopiedField(null),2000); };

  const handleDragStart = () => setIsDragging(true);
  const handleDrag = (e: React.MouseEvent|React.TouchEvent) => {
    if (!isDragging||!previewRef.current) return;
    const rect=previewRef.current.getBoundingClientRect();
    const cx="touches"in e?e.touches[0].clientX:e.clientX; const cy="touches"in e?e.touches[0].clientY:e.clientY;
    setOverlayPosition({ x:Math.max(-40,Math.min(40,((cx-rect.left)/rect.width)*100-50)), y:Math.max(-40,Math.min(40,((cy-rect.top)/rect.height)*100-50)) });
  };
  const handleDragEnd = () => setIsDragging(false);

  const QuotaBar = ({ used, total, color }: { used:number; total:number; color:string }) => (
    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} transition-all duration-700`} style={{width:`${total>0?Math.min(100,(used/total)*100):0}%`}}/>
    </div>
  );

  const sceneInfo = (() => {
    if (!uploadedImage) return null;
    if (showCustomEnv&&customEnvPrompt) return { label:"Custom", color:"rose" };
    if (productAnalysis&&selectedEnvId) { const e=productAnalysis.environments.find(e=>e.id===selectedEnvId); if (e) return { label:e.label, color:"violet" }; }
    return null;
  })();

  const planDef = PLAN_DEFS[session.plan] || PLAN_DEFS.free;
  const stripeStatus = stripe.ready ? "live" : stripe.keysPresent ? "partial" : "none";

  // ── Account Modal ─────────────────────────────────────────────────────────

  const AccountModal = () => {
    const imageUsedPct = session.imagesTotal > 0 ? Math.min(100, ((session.imagesTotal - session.imagesLeft) / session.imagesTotal) * 100) : 0;
    const videoUsedPct = session.videosTotal > 0 ? Math.min(100, ((session.videosTotal - session.videosLeft) / session.videosTotal) * 100) : 0;
    const renewDate = session.expiresAt ? new Date(session.expiresAt).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }) : null;

    return (
      <div className="fixed inset-0 z-[140] flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
        <motion.div initial={{opacity:0,y:40}} animate={{opacity:1,y:0}} exit={{opacity:0,y:40}}
          className="bg-white rounded-[2rem] shadow-2xl max-w-md w-full overflow-hidden max-h-[90vh] overflow-y-auto">

          {/* Header */}
          <div className={cn("p-6 text-white", session.plan==="free"?"bg-slate-800":"bg-gradient-to-br from-slate-900 to-slate-700")}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-2xl">{planDef.emoji}</div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Current Plan</p>
                  <p className="text-xl font-black">{session.plan.charAt(0).toUpperCase()+session.plan.slice(1)}</p>
                  {renewDate && <p className="text-[10px] text-white/50">Renews {renewDate}</p>}
                </div>
              </div>
              <button onClick={()=>setShowAccountModal(false)} className="p-2 hover:bg-white/10 rounded-xl"><X size={18}/></button>
            </div>

            {/* Quota bars */}
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1.5"><span className="text-white/70 font-medium flex items-center gap-1"><ImageIcon size={11}/>Images</span><span className="font-black">{session.imagesLeft} / {session.imagesTotal || "Γê₧"} left</span></div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-white/80 rounded-full transition-all duration-700" style={{width:`${100-imageUsedPct}%`}}/></div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1.5"><span className="text-white/70 font-medium flex items-center gap-1"><Video size={11}/>Videos</span><span className="font-black">{session.videosLeft} / {session.videosTotal || "—"} left</span></div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-rose-400 rounded-full transition-all duration-700" style={{width:`${100-videoUsedPct}%`}}/></div>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {/* Billing actions */}
            {session.plan !== "free" && (
              <div className="grid grid-cols-2 gap-3">
                <button onClick={openBillingPortal} disabled={portalLoading}
                  className="flex items-center justify-center gap-2 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl text-xs transition-all disabled:opacity-50">
                  {portalLoading?<Loader2 size={14} className="animate-spin"/>:<Portal size={14}/>} Manage Billing
                </button>
                <button onClick={()=>{setShowAccountModal(false);document.getElementById("pricing-section")?.scrollIntoView({behavior:"smooth"});}}
                  className="flex items-center justify-center gap-2 py-3 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-2xl text-xs transition-all border border-rose-200">
                  <Crown size={14}/> Upgrade Plan
                </button>
              </div>
            )}

            {session.plan === "free" && (
              <button onClick={()=>{setShowAccountModal(false);setShowUpgradeModal(true);}}
                className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-2xl flex items-center justify-center gap-2 text-sm shadow-lg shadow-rose-200 transition-all">
                <Crown size={16}/> Upgrade to Paid Plan
              </button>
            )}

            {/* Top-up packs */}
            <div className="space-y-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Quick Top-ups</p>
              <div className="grid grid-cols-2 gap-2">
                {TOPUP_PACKS.slice(0,4).map(p => {
                  const lk = checkoutLoading===p.key;
                  return (
                    <button key={p.key} onClick={()=>startCheckout("topup","monthly",p.key)} disabled={!!checkoutLoading}
                      className={cn("flex items-center justify-between px-3 py-2.5 rounded-2xl border text-left transition-all hover:scale-[1.02] disabled:opacity-60",
                        p.highlight?"border-rose-200 bg-rose-50":"border-slate-100 hover:border-rose-200 bg-white")}>
                      <div><p className="text-[10px] font-black text-slate-700">{p.label}</p></div>
                      <div className="flex items-center gap-1">{lk&&<Loader2 size={11} className="animate-spin text-rose-500"/>}<span className="text-xs font-black text-rose-600">${p.price}</span></div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Usage history */}
            {session.topupHistory.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recent Top-ups</p>
                <div className="space-y-1.5 max-h-28 overflow-y-auto">
                  {session.topupHistory.map((h,i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-xs text-slate-600 font-medium">{h.label}</p>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-slate-400">{new Date(h.date).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
                        <span className="text-xs font-black text-emerald-600">${h.amount}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stripe info */}
            <div className={cn("flex items-center gap-3 p-3 rounded-2xl border text-xs font-medium",
              stripeStatus==="live"?"bg-emerald-50 border-emerald-200 text-emerald-700":
              stripeStatus==="partial"?"bg-amber-50 border-amber-200 text-amber-700":
              "bg-slate-50 border-slate-200 text-slate-500")}>
              <CreditCard size={15}/>
              {stripeStatus==="live" ? "Stripe connected · Test mode" :
               stripeStatus==="partial" ? "Stripe keys found — prices needed" :
               <button onClick={()=>{setShowAccountModal(false);setShowStripeSetup(true);}} className="underline">Setup Stripe payments</button>}
            </div>

            {/* Reset (dev helper) */}
            <button onClick={()=>{const s=defaultSession();saveSession(s);setShowAccountModal(false);showToast("success","Session reset to free plan.");}}
              className="w-full py-2.5 text-slate-400 text-xs font-medium hover:text-slate-600 hover:bg-slate-50 rounded-2xl transition-all flex items-center justify-center gap-2">
              <RefreshCcw size={12}/> Reset session (dev)
            </button>
          </div>
        </motion.div>
      </div>
    );
  };

  // ── Upgrade Modal ─────────────────────────────────────────────────────────

  const UpgradeModal = () => (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <motion.div initial={{opacity:0,scale:0.92}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:0.92}}
        className="bg-white p-8 rounded-[2rem] shadow-2xl max-w-sm w-full space-y-5">
        <div className="text-center">
          <div className="w-14 h-14 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-3 text-rose-600"><TrendingUp size={28}/></div>
          <h4 className="text-xl font-black text-slate-900 mb-1">Out of {session.imagesLeft<=0?"Images":"Videos"}</h4>
          <p className="text-slate-500 text-sm">Upgrade or top-up to keep creating.</p>
        </div>
        <div className="space-y-2">
          {(["starter","pro","scale"] as const).map(key => {
            const p=PLAN_DEFS[key]; const lk=checkoutLoading===`${key}_monthly`;
            return (
              <button key={key} onClick={()=>startCheckout(key,"monthly")} disabled={!!checkoutLoading}
                className={cn("w-full flex items-center justify-between px-4 py-3.5 rounded-2xl border-2 transition-all hover:scale-[1.01] disabled:opacity-60",
                  p.popular?"border-rose-500 bg-rose-50":"border-slate-100 hover:border-rose-200")}>
                <div className="text-left"><p className="font-black text-slate-900 text-sm">{p.emoji} {key.charAt(0).toUpperCase()+key.slice(1)}{p.popular&&<span className="text-rose-600 text-[10px] ml-1">Popular</span>}</p><p className="text-[10px] text-slate-400">{p.images} images · {p.videos} videos/mo</p></div>
                <div className="flex items-center gap-2">{lk&&<Loader2 size={13} className="animate-spin text-rose-400"/>}<span className="font-black text-rose-600 text-sm">${p.monthly}/mo</span></div>
              </button>
            );
          })}
        </div>
        <div className="space-y-2">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Or top-up without upgrading</p>
          <div className="grid grid-cols-3 gap-2">
            {TOPUP_PACKS.slice(0,3).map(p => (
              <button key={p.key} onClick={()=>startCheckout("topup","monthly",p.key)} disabled={!!checkoutLoading}
                className={cn("py-2.5 rounded-2xl border text-center transition-all hover:scale-[1.02] disabled:opacity-60",p.highlight?"border-rose-200 bg-rose-50":"border-slate-100 hover:border-rose-200")}>
                <p className="text-[9px] font-black text-slate-600 leading-tight">{p.label}</p>
                <p className="text-xs font-black text-rose-600 mt-0.5">${p.price}</p>
              </button>
            ))}
          </div>
        </div>
        <button onClick={()=>setShowUpgradeModal(false)} className="w-full text-slate-400 text-xs hover:underline">Maybe later</button>
      </motion.div>
    </div>
  );

  // ── Stripe Setup Modal ────────────────────────────────────────────────────

  const StripeSetupModal = () => {
    const envHasKeys = !!(readEnv("STRIPE_SECRET_KEY") || readEnv("STRIPE_PUBLISHABLE_KEY"));
    const priceCount = Object.keys(stripe.priceIds).length;
    return (
      <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
        <motion.div initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:0.95}}
          className="bg-white rounded-[2rem] shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white sticky top-0 z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3"><div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center"><CreditCard size={20}/></div><div><h3 className="font-black text-lg">Stripe Payments</h3><p className="text-slate-400 text-xs">Test mode · Auto-reads from .env</p></div></div>
              <button onClick={()=>setShowStripeSetup(false)} className="p-2 hover:bg-white/10 rounded-xl"><X size={17}/></button>
            </div>
          </div>
          <div className="p-6 space-y-5">
            {/* Status cards */}
            <div className="grid grid-cols-3 gap-3">
              {[{label:"Secret Key",ok:!!stripe.secretKey,hint:envHasKeys?"from .env":"manual"},{label:"Pub Key",ok:!!stripe.publishableKey,hint:envHasKeys?"from .env":"manual"},{label:"Price IDs",ok:priceCount===13,hint:`${priceCount}/13`}].map(s=>(
                <div key={s.label} className={cn("flex flex-col items-center gap-1 p-3 rounded-2xl border text-center",s.ok?"bg-emerald-50 border-emerald-200":"bg-amber-50 border-amber-200")}>
                  {s.ok?<CheckCircle2 size={17} className="text-emerald-500"/>:<AlertCircle size={17} className="text-amber-500"/>}
                  <p className="text-[10px] font-black text-slate-700">{s.label}</p>
                  <p className="text-[9px] text-slate-400">{s.hint}</p>
                </div>
              ))}
            </div>

            {envHasKeys&&<div className="flex items-start gap-3 p-4 bg-emerald-50 rounded-2xl border border-emerald-200"><ShieldCheck size={16} className="text-emerald-600 mt-0.5 shrink-0"/><div><p className="text-sm font-bold text-emerald-800">Stripe keys auto-loaded from .env ✓</p><p className="text-xs text-emerald-700 mt-0.5">Your <code className="bg-emerald-100 px-1 rounded">STRIPE_SECRET_KEY</code> and <code className="bg-emerald-100 px-1 rounded">STRIPE_PUBLISHABLE_KEY</code> were detected automatically.</p></div></div>}

            {!envHasKeys&&(
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-2xl border border-amber-200"><AlertCircle size={16} className="text-amber-600 mt-0.5 shrink-0"/><p className="text-sm text-amber-700">Keys not in .env. Add <code className="bg-amber-100 px-1 rounded">STRIPE_SECRET_KEY</code> and <code className="bg-amber-100 px-1 rounded">STRIPE_PUBLISHABLE_KEY</code>, or enter below temporarily.</p></div>
                <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Secret Key</label><input type="password" placeholder="sk_test_..." className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-mono text-slate-700 focus:ring-2 focus:ring-slate-400 outline-none" value={manualSk} onChange={e=>setManualSk(e.target.value)}/></div>
                <div className="space-y-2"><label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Publishable Key</label><input type="text" placeholder="pk_test_..." className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-mono text-slate-700 focus:ring-2 focus:ring-slate-400 outline-none" value={manualPk} onChange={e=>setManualPk(e.target.value)}/></div>
                <button onClick={saveManualKeys} disabled={!manualSk||!manualPk} className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-2xl text-sm flex items-center justify-center gap-2 disabled:opacity-40"><Check size={14}/>Save Keys Temporarily</button>
              </div>
            )}

            {stripe.keysPresent && priceCount < 13 && (
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-2xl border border-blue-200"><Sparkles size={15} className="text-blue-600 mt-0.5 shrink-0"/><div><p className="text-sm font-bold text-blue-800">{13-priceCount} price ID{13-priceCount>1?"s":""} missing</p><p className="text-xs text-blue-700 mt-0.5">Click below to auto-create in Stripe. IDs already in .env are skipped.</p></div></div>
                <button onClick={autoCreatePrices} disabled={isCreatingPrices} className="w-full py-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white font-black rounded-2xl text-sm flex items-center justify-center gap-2">{isCreatingPrices?<><Loader2 className="animate-spin" size={16}/>Creating...</>:<><CreditCard size={16}/>Auto-Create Missing Prices</>}</button>
              </div>
            )}
            {stripe.ready && <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-2xl border border-emerald-200"><CheckCircle2 size={17} className="text-emerald-500"/><p className="text-sm font-bold text-emerald-800">All 13 price IDs active — checkout is live ✓</p></div>}

            {creationLog.length>0&&<div className="bg-slate-900 rounded-2xl p-4 max-h-52 overflow-y-auto font-mono text-xs space-y-0.5">{creationLog.map((m,i)=><p key={i} className={cn("leading-relaxed",m.startsWith("≡ƒÄë")||m.startsWith("  STRIPE_")?"text-emerald-400 font-bold":m.startsWith("  ✓")?"text-emerald-400":m.startsWith("  ")?"text-slate-400":"text-white")}>{m}</p>)}{isCreatingPrices&&<p className="text-slate-500 animate-pulse">Γûè</p>}</div>}
            {creationError&&<div className="flex items-start gap-2 p-3 bg-rose-50 rounded-xl border border-rose-100"><AlertCircle size={13} className="text-rose-500 mt-0.5 shrink-0"/><p className="text-xs text-rose-600 font-medium">{creationError}</p></div>}
          </div>
        </motion.div>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#fafafa] text-slate-900 font-sans selection:bg-rose-100 selection:text-rose-600">

      {/* Toast */}
      <AnimatePresence>
        {paymentToast && (
          <motion.div initial={{opacity:0,y:-60}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-60}}
            className={cn("fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 text-white max-w-md w-full mx-4",
              paymentToast.type==="success"?"bg-emerald-600":"bg-rose-600")}>
            {paymentToast.type==="success"?<CheckCircle2 size={20}/>:<AlertCircle size={20}/>}
            <p className="font-bold text-sm">{paymentToast.message}</p>
            <button onClick={()=>setPaymentToast(null)} className="ml-auto opacity-70 hover:opacity-100"><X size={15}/></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-rose-600 rounded-lg flex items-center justify-center text-white"><Sparkles size={17}/></div>
            <h1 className="font-bold text-xl tracking-tight">PinViral</h1>
            {session.plan!=="free"&&<span className={cn("hidden sm:flex items-center gap-1 px-2.5 py-1 text-[10px] font-black rounded-full uppercase tracking-tight",session.plan==="pro"?"bg-rose-100 text-rose-700":"bg-violet-100 text-violet-700")}><Crown size={9}/>{session.plan}</span>}
          </div>

          <div className="flex items-center gap-3">
            {/* Quotas */}
            <div className="hidden sm:flex flex-col gap-1 min-w-[128px]">
              <div className="flex items-center justify-between text-[9px] font-bold text-slate-400 uppercase tracking-wider"><span className="flex items-center gap-1"><ImageIcon size={9}/>Images</span><span className={session.imagesLeft<=2?"text-rose-600 animate-pulse":""}>{session.imagesLeft} left</span></div>
              <QuotaBar used={(session.imagesTotal||3)-session.imagesLeft} total={session.imagesTotal||3} color="bg-rose-500"/>
              <div className="flex items-center justify-between text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5"><span className="flex items-center gap-1"><Video size={9}/>Videos</span><span className={session.videosLeft<=0&&session.plan!=="free"?"text-indigo-600 animate-pulse":""}>{session.videosLeft} left</span></div>
              <QuotaBar used={(session.videosTotal||0)-session.videosLeft} total={Math.max(session.videosTotal||0,1)} color="bg-indigo-500"/>
            </div>

            {/* Stripe status */}
            <button onClick={()=>setShowStripeSetup(true)}
              className={cn("hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-all",
                stripeStatus==="live"?"bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100":
                stripeStatus==="partial"?"bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100":
                "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100")}>
              <CreditCard size={12}/>{stripeStatus==="live"?"Stripe ✓":stripeStatus==="partial"?"Stripe ⚠️":"Setup Stripe"}
            </button>

            {/* Account button */}
            <button onClick={()=>setShowAccountModal(true)}
              className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all">
              <div className="w-6 h-6 bg-slate-800 rounded-full flex items-center justify-center text-white"><User size={12}/></div>
              <span className="hidden sm:block text-xs font-bold text-slate-700 capitalize">{session.plan}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-12">

        {/* Hero */}
        <section className="text-center mb-12">
          <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{duration:0.5}}>
            <h2 className="text-4xl sm:text-6xl font-extrabold text-slate-900 mb-4 tracking-tight">
              What are you <span className="text-rose-600">selling</span> today?
            </h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto mb-8">Follow the steps below — product to viral pin in minutes.</p>
            <div className="max-w-2xl mx-auto space-y-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400"><Search size={20}/></div>
                  <input type="text" placeholder="e.g. Minimalist Ceramic Vase"
                    className="w-full pl-12 pr-4 py-5 bg-white border border-slate-200 rounded-3xl shadow-sm focus:ring-2 focus:ring-rose-500 outline-none transition-all text-lg text-slate-700"
                    value={productName} onChange={e=>setProductName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&generateStrategy()}/>
                </div>
                <button onClick={generateStrategy} disabled={isLoading||!productName.trim()}
                  className="px-10 py-5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white font-bold rounded-3xl shadow-lg shadow-rose-200 transition-all flex items-center justify-center gap-2 group">
                  {isLoading?<Loader2 className="animate-spin" size={22}/>:<>Generate Strategy<ArrowRight size={19} className="group-hover:translate-x-1 transition-transform"/></>}
                </button>
              </div>
              <AnimatePresence>{error&&<motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} className="bg-rose-50 border border-rose-100 p-4 rounded-2xl text-rose-700 text-sm font-medium flex items-start gap-3"><AlertCircle size={17} className="shrink-0 mt-0.5"/><p>{error}</p></motion.div>}</AnimatePresence>
            </div>
          </motion.div>
        </section>

        {/* Steps */}
        {strategy && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} className="mb-24">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
              <div className="lg:col-span-7 space-y-10">

                {/* Step 1 — Viral Angle */}
                <StepCard number={1} title="Choose Viral Angle" subtitle="Pick the psychology behind your pin">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {strategy.angles.map((angle,i)=>(
                      <button key={i} onClick={()=>selectAngle(i,angle)}
                        className={cn("p-5 rounded-[1.75rem] border-2 text-left transition-all hover:scale-[1.02] flex flex-col h-full group",selectedAngleIndex===i?"bg-white border-rose-600 shadow-xl shadow-rose-100 ring-4 ring-rose-50":"bg-white border-slate-100 shadow-sm hover:border-rose-200")}>
                        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center mb-3 transition-colors",selectedAngleIndex===i?"bg-rose-600 text-white":"bg-slate-100 text-slate-400 group-hover:bg-rose-100 group-hover:text-rose-600")}><Zap size={17}/></div>
                        <h4 className="font-black text-slate-900 mb-1.5 text-sm tracking-tight">{angle.title}</h4>
                        <p className="text-xs text-slate-500 leading-relaxed font-medium flex-1">{angle.hook}</p>
                        {selectedAngleIndex===i&&<div className="mt-3 flex items-center gap-1.5 text-rose-600 text-[10px] font-black uppercase tracking-widest"><Check size={10}/>Selected</div>}
                      </button>
                    ))}
                  </div>
                </StepCard>

                {/* Step 2 — Upload */}
                <StepCard number={2} title="Upload Your Product Photo" subtitle="AI keeps your product identical — only the world around it changes">
                  <div className="space-y-4">
                    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        {uploadedImage?(
                          <div className="relative rounded-2xl overflow-hidden border border-slate-100 aspect-square bg-slate-50">
                            <img src={uploadedImage} alt="Product" className="w-full h-full object-contain"/>
                            {isAnalyzingProduct&&<div className="absolute inset-0 bg-violet-900/65 backdrop-blur-sm flex flex-col items-center justify-center gap-2"><Loader2 className="animate-spin text-white" size={26}/><p className="text-white text-sm font-bold">Analyzing...</p></div>}
                            <button onClick={()=>{setUploadedImage(null);setProductAnalysis(null);setSelectedEnvId(null);setGeneratedImage(null);setAnalysisError(null);}} className="absolute top-2 right-2 px-2.5 py-1 bg-white/90 text-rose-600 text-xs font-bold rounded-full shadow hover:bg-white">Remove</button>
                          </div>
                        ):(
                          <label className="flex flex-col items-center justify-center aspect-square bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:bg-slate-100 transition-all group">
                            <input type="file" className="hidden" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(f){const r=new FileReader();r.onloadend=()=>{const d=r.result as string;setUploadedImage(d);setGeneratedImage(null);analyzeProductImage(d);};r.readAsDataURL(f);}}}/>
                            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-300 group-hover:text-violet-500 transition-colors shadow-sm mb-3"><Upload size={23}/></div>
                            <p className="font-black text-slate-700">Upload Photo</p>
                            <p className="text-xs text-slate-400 mt-1">Auto-generates 5 scenes</p>
                          </label>
                        )}
                        <div className="flex flex-col justify-center space-y-3">
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Social Proof URL <span className="normal-case text-slate-300 font-normal">(optional)</span></p>
                            <div className="relative">
                              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-300"><ExternalLink size={14}/></div>
                              <input type="text" placeholder="amazon.com/your-product"
                                className="w-full pl-8 pr-14 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-700 focus:ring-2 focus:ring-rose-400 outline-none transition-all"
                                value={productUrl} onChange={e=>setProductUrl(e.target.value)}/>
                              {isAnalyzingSocialProof?<div className="absolute right-3 top-1/2 -translate-y-1/2"><Loader2 size={13} className="animate-spin text-rose-500"/></div>:
                               productUrl?<button onClick={()=>fetchSocialProof(null,productUrl)} className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-rose-600 text-white text-[10px] font-bold rounded-xl hover:bg-rose-700">Fetch</button>:null}
                            </div>
                          </div>
                          {socialProof&&<div className="flex items-center gap-2 text-emerald-600 text-xs font-bold bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-100"><Check size={12}/>Social proof added to pin</div>}
                        </div>
                      </div>
                    </div>

                    {/* Environment selector */}
                    <AnimatePresence>
                      {uploadedImage&&(
                        <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}
                          className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
                          <div className="px-6 pt-5 pb-4 border-b border-slate-100">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5"><div className="w-8 h-8 bg-violet-100 rounded-xl flex items-center justify-center text-violet-600"><Shuffle size={15}/></div><div><p className="font-black text-slate-900 text-sm">Scene Environment</p><p className="text-[10px] text-slate-400">Same product · Different world</p></div></div>
                              {isAnalyzingProduct&&<div className="flex items-center gap-1.5 text-violet-600 text-[10px] font-bold bg-violet-50 px-2.5 py-1 rounded-full border border-violet-100 animate-pulse"><Loader2 size={9} className="animate-spin"/>Generating...</div>}
                            </div>
                            {productAnalysis?.productDescription&&<motion.div initial={{opacity:0}} animate={{opacity:1}} className="mt-3 space-y-2">
                              <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100"><Eye size={12} className="text-slate-400 mt-0.5 shrink-0"/><div><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Detected</p><p className="text-xs text-slate-700 font-medium">{productAnalysis.productDescription}</p></div></div>
                              {productAnalysis.keyVisualDetails&&<div className="flex items-start gap-2 p-3 bg-amber-50 rounded-xl border border-amber-100"><Sparkles size={12} className="text-amber-500 mt-0.5 shrink-0"/><div><p className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Locked</p><p className="text-xs text-amber-700 font-medium">{productAnalysis.keyVisualDetails}</p></div></div>}
                            </motion.div>}
                            {analysisError&&<div className="mt-2 flex items-start gap-2 p-3 bg-rose-50 rounded-xl border border-rose-100"><AlertCircle size={12} className="text-rose-500 mt-0.5 shrink-0"/><p className="text-xs text-rose-600 font-medium">{analysisError}</p></div>}
                          </div>
                          {isAnalyzingProduct&&!productAnalysis&&<div className="p-5 space-y-2">{[1,2,3,4,5].map(i=><div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 animate-pulse"><div className="w-8 h-8 bg-slate-200 rounded-xl shrink-0"/><div className="flex-1 space-y-1.5"><div className="h-2.5 bg-slate-200 rounded w-1/3"/><div className="h-2 bg-slate-200 rounded w-2/3"/></div></div>)}</div>}
                          {productAnalysis?.environments&&productAnalysis.environments.length>0&&(
                            <div className="p-5 space-y-2">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Choose a Scene</p>
                              {productAnalysis.environments.map((env,i)=>(
                                <motion.button key={env.id} initial={{opacity:0,x:-6}} animate={{opacity:1,x:0}} transition={{delay:i*0.04}}
                                  onClick={()=>{setSelectedEnvId(env.id);setShowCustomEnv(false);}}
                                  className={cn("w-full flex items-start gap-3 p-3.5 rounded-2xl border-2 text-left transition-all hover:scale-[1.01]",selectedEnvId===env.id&&!showCustomEnv?"border-violet-500 bg-violet-50 shadow-md shadow-violet-100":"border-slate-100 bg-slate-50 hover:border-violet-200")}>
                                  <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0",selectedEnvId===env.id&&!showCustomEnv?"bg-violet-600 text-white":"bg-white text-slate-400")}>{ENV_ICONS[env.icon]||<Camera size={13}/>}</div>
                                  <div className="flex-1 min-w-0"><div className="flex items-center gap-2 mb-0.5"><p className="font-black text-slate-900 text-xs">{env.label}</p><span className={cn("px-1.5 py-0.5 text-[9px] font-black rounded-full uppercase",selectedEnvId===env.id&&!showCustomEnv?"bg-violet-200 text-violet-700":"bg-slate-200 text-slate-500")}>{env.mood}</span></div><p className="text-[10px] text-slate-500 font-medium line-clamp-1">{env.prompt}</p></div>
                                  {selectedEnvId===env.id&&!showCustomEnv&&<Check size={12} className="text-violet-600 shrink-0 mt-1"/>}
                                </motion.button>
                              ))}
                              <motion.button initial={{opacity:0,x:-6}} animate={{opacity:1,x:0}} transition={{delay:(productAnalysis?.environments?.length||0)*0.04}}
                                onClick={()=>setShowCustomEnv(true)}
                                className={cn("w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 text-left transition-all",showCustomEnv?"border-rose-500 bg-rose-50":"border-dashed border-slate-200 hover:border-rose-300")}>
                                <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0",showCustomEnv?"bg-rose-600 text-white":"bg-slate-100 text-slate-400")}><Wand2 size={14}/></div>
                                <div><p className="font-black text-slate-900 text-xs">Custom Scene</p><p className="text-[10px] text-slate-400">Write your own environment</p></div>
                                {showCustomEnv&&<Check size={12} className="text-rose-600 ml-auto"/>}
                              </motion.button>
                              <AnimatePresence>{showCustomEnv&&<motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}><textarea className="w-full p-4 bg-rose-50 border-2 border-rose-200 rounded-2xl text-sm text-slate-700 focus:ring-2 focus:ring-rose-400 outline-none resize-none h-24 font-medium placeholder-rose-300" value={customEnvPrompt} onChange={e=>setCustomEnvPrompt(e.target.value)} placeholder="Describe the new scene. Product stays identical."/></motion.div>}</AnimatePresence>
                            </div>
                          )}
                          {!isAnalyzingProduct&&!productAnalysis&&<div className="p-5"><textarea className="w-full p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-sm text-slate-700 focus:ring-2 focus:ring-violet-400 outline-none resize-none h-24 font-medium" value={customEnvPrompt} onChange={e=>setCustomEnvPrompt(e.target.value)} placeholder="Describe the environment where your product should appear."/></div>}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </StepCard>

                {/* Step 3 — Copy & SEO */}
                <StepCard number={3} title="Copy & SEO Content" subtitle="Headlines, description and tags ready to copy" badge="Auto-generated">
                  {selectedAngleIndex!==null&&(
                    <div className="space-y-4">
                      <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm relative overflow-hidden group"><div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity"><Sparkles size={55}/></div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Viral Psychology</p><p className="text-slate-600 leading-relaxed font-medium italic text-sm">"{strategy.angles[selectedAngleIndex].psychology}"</p></div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm"><div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600"><Search size={16}/></div><p className="font-black text-slate-900 text-sm">SEO Description</p></div><button onClick={()=>copyToClipboard(strategy.angles[selectedAngleIndex].pinDescription,"desc")} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400">{copiedField==="desc"?<Check size={15} className="text-emerald-500"/>:<Copy size={15}/>}</button></div><div className="bg-slate-50 p-3 rounded-2xl border border-slate-100"><p className="text-slate-600 text-xs leading-relaxed whitespace-pre-wrap">{strategy.angles[selectedAngleIndex].pinDescription}</p></div></div>
                        <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm"><div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><div className="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600"><Accessibility size={16}/></div><p className="font-black text-slate-900 text-sm">Alt Text</p></div><button onClick={()=>copyToClipboard(editableAltText,"alt")} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400">{copiedField==="alt"?<Check size={15} className="text-emerald-500"/>:<Copy size={15}/>}</button></div><div className="bg-slate-50 p-3 rounded-2xl border border-slate-100"><textarea className="w-full bg-transparent text-slate-600 text-xs leading-relaxed outline-none resize-none h-24 font-medium" value={editableAltText} onChange={e=>setEditableAltText(e.target.value)} placeholder="Describe the image..."/></div></div>
                        <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm md:col-span-2"><div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600"><Hash size={16}/></div><p className="font-black text-slate-900 text-sm">Viral Tags</p></div><button onClick={()=>copyToClipboard(strategy.angles[selectedAngleIndex].hashtags.join(" "),"tags")} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400">{copiedField==="tags"?<Check size={15} className="text-emerald-500"/>:<Copy size={15}/>}</button></div><div className="flex flex-wrap gap-2">{strategy.angles[selectedAngleIndex].hashtags.map((tag,i)=><span key={i} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-100">{tag}</span>)}</div></div>
                      </div>
                    </div>
                  )}
                </StepCard>

                {/* Step 4 — Generate Visual */}
                <StepCard number={4} title="Generate Your Pin Visual" subtitle="AI creates a stunning product image based on your angle and scene">
                  <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
                    {sceneInfo&&<div className={cn("flex items-center gap-2 px-4 py-2 rounded-xl border w-fit text-xs font-bold",sceneInfo.color==="violet"?"bg-violet-50 border-violet-100 text-violet-700":"bg-rose-50 border-rose-100 text-rose-700")}><div className={cn("w-1.5 h-1.5 rounded-full animate-pulse",sceneInfo.color==="violet"?"bg-violet-500":"bg-rose-500")}/>Scene: {sceneInfo.label}</div>}
                    {session.imagesLeft<=0?(
                      <button onClick={()=>setShowUpgradeModal(true)} className="w-full py-5 bg-slate-100 border-2 border-dashed border-slate-300 text-slate-500 font-black text-lg rounded-[1.5rem] flex items-center justify-center gap-3 hover:border-rose-400 hover:text-rose-500 transition-all"><Lock size={19}/>Upgrade for More Images</button>
                    ):(
                      <button onClick={generateImage} disabled={isGeneratingImage}
                        className="w-full py-5 bg-rose-600 hover:bg-rose-700 text-white font-black text-xl rounded-[1.5rem] shadow-xl shadow-rose-100 transition-all flex items-center justify-center gap-3 hover:scale-[1.01] disabled:opacity-50 disabled:hover:scale-100">
                        {isGeneratingImage?<><Loader2 className="animate-spin" size={21}/>Generating...</>:<><Sparkles size={21}/>Generate AI Visual</>}
                      </button>
                    )}
                    <p className="text-center text-[10px] text-slate-400 font-medium uppercase tracking-widest">{session.imagesLeft} image{session.imagesLeft!==1?"s":""} remaining</p>
                    {selectedAngleIndex!==null&&<div className="space-y-2 pt-2 border-t border-slate-100"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Headline for Overlay</p><div className="flex flex-wrap gap-2">{strategy.angles[selectedAngleIndex].headlines.map((h,i)=><button key={i} onClick={()=>setEditableHeadline(h)} className={cn("px-3 py-2 text-[10px] font-bold rounded-xl border transition-all",editableHeadline===h?"bg-rose-600 border-rose-600 text-white":"bg-white border-slate-100 text-slate-600 hover:border-rose-200")}>Var {i+1}</button>)}</div></div>}
                  </div>
                </StepCard>

                {/* Step 5 — Voiceover */}
                <StepCard number={5} title="Voiceover Script" subtitle="Optional — ready-to-record script for your video pin" badge="Optional" dimmed={!generatedImage&&!uploadedImage}>
                  <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100">
                      <div className="flex items-center gap-3 mb-4"><div className="w-9 h-9 bg-rose-100 rounded-xl flex items-center justify-center text-rose-600"><Mic size={17}/></div><div><p className="font-black text-slate-900 text-sm">Auto-Generate Voiceover</p><p className="text-[11px] text-slate-400">15-30 sec · Matched to your angle</p></div></div>
                      <div className="space-y-2 mb-4"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tone</p><div className="grid grid-cols-5 gap-2">{VOICE_TONES.map(t=><button key={t.id} onClick={()=>setSelectedVoiceTone(t.id)} className={cn("flex flex-col items-center gap-1 p-2.5 rounded-2xl border-2 transition-all hover:scale-[1.03]",selectedVoiceTone===t.id?"border-rose-500 bg-rose-50":"border-slate-100 bg-slate-50 hover:border-rose-200")}><span className="text-base">{t.emoji}</span><p className={cn("text-[9px] font-black uppercase tracking-tight",selectedVoiceTone===t.id?"text-rose-700":"text-slate-500")}>{t.label}</p></button>)}</div><p className="text-[11px] text-slate-400">{VOICE_TONES.find(t=>t.id===selectedVoiceTone)?.desc}</p></div>
                      <button onClick={generateVoiceover} disabled={isGeneratingVoiceover||selectedAngleIndex===null} className="w-full py-4 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white font-black rounded-2xl text-sm flex items-center justify-center gap-2 disabled:opacity-50">{isGeneratingVoiceover?<><Loader2 className="animate-spin" size={15}/>Writing...</>:<><FileText size={15}/>Generate Script</>}</button>
                    </div>
                    <AnimatePresence>{voiceoverScript&&(
                      <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}>
                        <div className="p-6 space-y-4">
                          <div className="flex items-center justify-between"><button onClick={()=>setVoiceoverExpanded(!voiceoverExpanded)} className="flex items-center gap-2 text-slate-900 font-black text-sm"><Volume2 size={14} className="text-rose-500"/>Your Script{voiceoverExpanded?<ChevronUp size={12}/>:<ChevronDown size={12}/>}</button><div className="flex items-center gap-2"><span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Γëê {voiceoverScript.duration}</span><button onClick={()=>copyToClipboard(voiceoverScript.script,"script")} className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400">{copiedField==="script"?<Check size={13} className="text-emerald-500"/>:<Copy size={13}/>}</button></div></div>
                          {voiceoverExpanded&&<motion.div initial={{opacity:0}} animate={{opacity:1}} className="space-y-4">
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100"><p className="text-slate-700 text-sm leading-loose font-medium whitespace-pre-wrap">{voiceoverScript.script}</p></div>
                            {voiceoverScript.hooks?.length>0&&<div className="space-y-2"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Play size={9}/>Alternative Hooks</p>{voiceoverScript.hooks.map((hook,i)=><div key={i} className="flex items-start gap-2 p-3 bg-white border border-slate-100 rounded-2xl group hover:border-rose-200 transition-all"><span className="text-[10px] font-black text-slate-300 mt-0.5 shrink-0">{i+1}</span><p className="text-xs text-slate-600 font-medium flex-1">{hook}</p><button onClick={()=>copyToClipboard(hook,`hook-${i}`)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-300 group-hover:text-slate-400">{copiedField===`hook-${i}`?<Check size={11} className="text-emerald-500"/>:<Copy size={11}/>}</button></div>)}</div>}
                            <button onClick={generateVoiceover} disabled={isGeneratingVoiceover} className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-2xl flex items-center justify-center gap-2 text-sm disabled:opacity-50"><RefreshCw size={13} className={isGeneratingVoiceover?"animate-spin":""}/>Regenerate</button>
                          </motion.div>}
                        </div>
                      </motion.div>
                    )}</AnimatePresence>
                  </div>
                </StepCard>

                {/* Step 6 — Animate & Export */}
                <StepCard number={6} title="Animate & Export" subtitle="Bring your pin to life as video, then download everything" dimmed={!generatedImage&&!uploadedImage}>
                  <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm space-y-4">
                    <div className="space-y-2"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Animation Vibe</p><textarea className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-xs text-slate-600 focus:ring-2 focus:ring-rose-500 outline-none transition-all h-20 resize-none font-medium" value={animationPrompt} onChange={e=>setAnimationPrompt(e.target.value)} placeholder="Describe the motion style..."/></div>
                    <div className="space-y-3">
                      {(generatedImage||uploadedImage)&&<button onClick={downloadImage} className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 hover:scale-[1.01]"><Download size={16}/>Download Pin Image</button>}
                      {session.videosLeft<=0?<button onClick={()=>setShowUpgradeModal(true)} className="w-full py-4 bg-slate-100 border-2 border-dashed border-slate-300 text-slate-500 font-black rounded-2xl flex items-center justify-center gap-2 hover:border-indigo-400 hover:text-indigo-500 transition-all"><Lock size={16}/>Upgrade for Video ({session.plan==="free"?"paid plan required":"add video top-up"})</button>:
                       (!animatedVideoUrl&&!isAnimating&&(generatedImage||uploadedImage))?<button onClick={animateImage} className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-2xl shadow-xl shadow-rose-100 transition-all flex items-center justify-center gap-2 hover:scale-[1.01]"><Zap size={16}/>Bring It To Life · {session.videosLeft} left</button>:null}
                      {animatedVideoUrl&&<div className="space-y-3"><div className="aspect-video rounded-2xl overflow-hidden bg-slate-100 shadow-inner"><video src={animatedVideoUrl} className="w-full h-full object-cover" controls autoPlay loop muted/></div>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={downloadVideo} className="py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 transition-all flex items-center justify-center gap-2 hover:scale-[1.01]"><Download size={15}/>Download</button>
                          {session.videosLeft<=0?(
                            <button onClick={()=>setShowUpgradeModal(true)} className="py-3.5 bg-slate-100 border-2 border-dashed border-slate-300 text-slate-400 font-black rounded-2xl flex items-center justify-center gap-1.5 hover:border-rose-400 hover:text-rose-500 transition-all text-xs"><Lock size={14}/>Extend</button>
                          ):(
                            <button onClick={extendVideo} disabled={isExtending||!lastVideoOperation}
                              className="py-3.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-black rounded-2xl shadow-xl shadow-violet-100 transition-all flex items-center justify-center gap-1.5 hover:scale-[1.01] text-sm">
                              {isExtending?<><Loader2 className="animate-spin" size={15}/>Extending...</>:<><RefreshCw size={15}/>Extend · {session.videosLeft} left</>}
                            </button>
                          )}
                        </div>
                        <p className="text-center text-[10px] text-slate-400">Each extension uses 1 video credit</p>
                      </div>}
                      {(isAnimating||isExtending)&&<div className="flex items-center gap-3 justify-center py-4 bg-slate-50 rounded-2xl border border-slate-100"><Loader2 className="animate-spin text-rose-500" size={17}/><p className="text-sm font-bold text-slate-600">{isExtending?"Extending video... ~60-90 seconds":"Animating... ~60-90 seconds"}</p></div>}
                    </div>
                  </div>
                </StepCard>

              </div>

              {/* Right: sticky preview + tracker */}
              <div className="lg:col-span-5 sticky top-24 space-y-5">
                <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50">
                  <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-black text-slate-900">Pin Preview</h3>{(generatedImage||uploadedImage)&&<button onClick={generateImage} disabled={isGeneratingImage} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-rose-600 transition-all"><RefreshCw size={16} className={isGeneratingImage?"animate-spin":""}/></button>}</div>
                  {(generatedImage||uploadedImage)?(
                    <>
                      <div ref={previewRef} className="aspect-[2/3] bg-slate-100 rounded-[1.75rem] overflow-hidden relative cursor-crosshair touch-none shadow-2xl mx-auto max-w-[280px]"
                        onMouseMove={handleDrag} onTouchMove={handleDrag} onMouseUp={handleDragEnd} onTouchEnd={handleDragEnd}>
                        {isGeneratingImage?<div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-30"><Loader2 className="animate-spin text-rose-600 mb-3" size={34}/><p className="font-bold text-slate-900 text-sm">Crafting...</p></div>:(
                          <><img src={generatedImage||uploadedImage||""} alt="Pin Preview" className="w-full h-full object-cover select-none" referrerPolicy="no-referrer" draggable={false}/>
                          <div className="absolute inset-0 flex flex-col justify-center items-center pointer-events-none" style={{transform:`translate(${overlayPosition.x}%,${overlayPosition.y}%) scale(${overlayScale})`}}>
                            <div className="max-w-[88%] pointer-events-auto cursor-move select-none active:scale-95 transition-transform text-center" onMouseDown={handleDragStart} onTouchStart={handleDragStart}>
                              <p className="text-white font-black text-sm leading-tight mb-1 uppercase italic tracking-tight drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">{editableHeadline}</p>
                              <p className="text-white text-[9px] font-bold leading-snug mb-2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] line-clamp-2">{editableSubtext}</p>
                              {socialProof&&<div className="flex flex-wrap gap-1 justify-center mb-2">{(socialProof.stars||socialProof.reviews)&&<span className="text-[7px] font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">Γÿà {socialProof.stars?`${socialProof.stars} Stars`:`${socialProof.reviews} Reviews`}</span>}{socialProof.sold&&<span className="text-[7px] font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] uppercase ml-2">{socialProof.sold}</span>}</div>}
                              <div className="inline-block px-3 py-1.5 bg-rose-600 text-white text-[8px] font-black rounded-full uppercase tracking-widest shadow-lg">{editableCTA}</div>
                            </div>
                          </div></>
                        )}
                      </div>
                      <div className="mt-4 space-y-3">
                        <div className="flex justify-between items-center"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Overlay Size</p><span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">{Math.round(overlayScale*100)}%</span></div>
                        <input type="range" min="0.5" max="1.5" step="0.05" value={overlayScale} onChange={e=>setOverlayScale(parseFloat(e.target.value))} className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-rose-600"/>
                        <p className="text-[10px] text-slate-300 text-center">Drag overlay to reposition</p>
                      </div>
                    </>
                  ):(
                    <div className="aspect-[2/3] max-w-[280px] mx-auto bg-slate-50 border-2 border-dashed border-slate-200 rounded-[1.75rem] flex flex-col items-center justify-center gap-3 text-center p-6"><div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm"><ImageIcon size={22} className="text-slate-200"/></div><div><p className="font-black text-slate-400 text-sm">Pin preview</p><p className="text-xs text-slate-300 mt-0.5">Complete steps 1–4</p></div></div>
                  )}
                </div>

                {/* Progress tracker */}
                <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Your Progress</p>
                  <div className="space-y-2.5">
                    {[{label:"Viral Angle",done:selectedAngleIndex!==null},{label:"Product Photo",done:!!uploadedImage},{label:"Copy & SEO",done:!!editableHeadline},{label:"AI Visual",done:!!generatedImage},{label:"Voiceover Script",done:!!voiceoverScript,optional:true},{label:"Animate / Export",done:!!animatedVideoUrl,optional:true}].map(step=>(
                      <div key={step.label} className="flex items-center gap-3"><div className={cn("w-5 h-5 rounded-full flex items-center justify-center shrink-0",step.done?"bg-emerald-500":"bg-slate-100 border-2 border-slate-200")}>{step.done&&<Check size={10} className="text-white"/>}</div><p className={cn("text-xs font-bold",step.done?"text-slate-700":"text-slate-400")}>{step.label}{step.optional&&<span className="ml-1.5 text-[9px] font-medium text-slate-300 uppercase">optional</span>}</p></div>
                    ))}
                  </div>
                </div>

                {/* Account quick panel */}
                <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{planDef.emoji}</span>
                      <div><p className="text-xs font-black text-slate-800 capitalize">{session.plan} Plan</p><p className="text-[9px] text-slate-400">{session.imagesLeft} imgs · {session.videosLeft} vids left</p></div>
                    </div>
                    <button onClick={()=>setShowAccountModal(true)} className="px-3 py-1.5 text-[10px] font-black text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all flex items-center gap-1"><Settings size={11}/>Manage</button>
                  </div>
                  {session.plan==="free"&&(
                    <button onClick={()=>setShowUpgradeModal(true)} className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-100 transition-all hover:scale-[1.01]"><Crown size={14}/>Upgrade for More Images & Videos</button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Empty state */}
        {!strategy&&!isLoading&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            <FeatureCard icon={<Zap className="text-rose-500"/>}       title="Viral Psychology"     desc="Proven impulse-buy triggers that get your pins saved and shared."/>
            <FeatureCard icon={<Shuffle className="text-violet-500"/>} title="5 Auto Scene Options" desc="Upload once — AI places your product in 5 stunning Pinterest-ready scenes."/>
            <FeatureCard icon={<Mic className="text-rose-500"/>}       title="Voiceover Scripts"    desc="Ready-to-record script matched to your pin's tone and angle."/>
          </motion.div>
        )}

        {/* Pricing */}
        <section id="pricing-section" className="py-24 border-t border-slate-100">
          <div className="max-w-6xl mx-auto">
            <div className="text-center max-w-3xl mx-auto mb-12">
              <h2 className="text-3xl md:text-5xl font-black text-slate-900 mb-5 tracking-tight leading-tight">Turn Products Into Viral Content — <span className="text-rose-600">Without Designers</span></h2>
              <p className="text-lg text-slate-600 mb-6">High-converting Pinterest visuals in seconds.</p>
              {!stripe.ready&&<motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} className="inline-flex items-center gap-3 px-5 py-3 bg-amber-50 border border-amber-200 rounded-2xl mb-6"><CreditCard size={15} className="text-amber-600"/><p className="text-sm text-amber-700 font-medium">{stripe.keysPresent?"Keys found — run auto-create to generate price IDs":"Add Stripe keys to .env to activate checkout"}</p><button onClick={()=>setShowStripeSetup(true)} className="px-3 py-1.5 bg-amber-600 text-white text-xs font-bold rounded-xl hover:bg-amber-700">{stripe.keysPresent?"Create Prices":"Setup Stripe"}</button></motion.div>}
              {stripe.ready&&<div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-2xl mb-6"><ShieldCheck size={14} className="text-emerald-600"/><p className="text-sm text-emerald-700 font-medium">Stripe connected · Test mode · All prices ready</p></div>}
              <div className="flex justify-center"><div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-2xl">{(["monthly","annual"] as const).map(c=><button key={c} onClick={()=>setBillingCycle(c)} className={cn("px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",billingCycle===c?"bg-white shadow text-slate-900":"text-slate-500 hover:text-slate-700")}>{c.charAt(0).toUpperCase()+c.slice(1)}{c==="annual"&&<span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded-full uppercase">Save 30%</span>}</button>)}</div></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-16">
              {(["starter","pro","scale","agency"] as const).map(key => {
                const p=PLAN_DEFS[key]; const price=billingCycle==="annual"?p.annual:p.monthly; const lk=checkoutLoading===`${key}_${billingCycle}`;
                const isCurrent=session.plan===key;
                return (
                  <div key={key} className={cn("relative bg-white p-6 rounded-[28px] border flex flex-col h-full transition-all duration-300",p.popular?"border-rose-200 shadow-xl shadow-rose-100 scale-105 z-10":isCurrent?"border-emerald-300 shadow-md":"border-slate-200 shadow-sm hover:shadow-md")}>
                    {p.popular&&<div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-rose-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest whitespace-nowrap">Most Popular</div>}
                    {isCurrent&&<div className="absolute -top-3 right-4 bg-emerald-500 text-white text-[9px] font-bold px-2.5 py-0.5 rounded-full uppercase">Current</div>}
                    <div className="mb-4"><div className="flex items-center gap-2 mb-1"><span className="text-xl">{p.emoji}</span><h3 className="text-base font-bold text-slate-900 uppercase tracking-tight">{key.charAt(0).toUpperCase()+key.slice(1)}</h3></div><div className="flex items-baseline gap-1 mb-0.5"><span className="text-3xl font-black text-slate-900">${price}</span><span className="text-slate-400 text-sm">/mo</span></div>{billingCycle==="annual"&&<p className="text-[10px] font-bold text-emerald-600">${Math.round(price*12)} billed annually</p>}<p className="text-slate-500 text-xs mt-1">{p.desc}</p></div>
                    <div className="flex gap-2 mb-4"><div className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 rounded-xl border border-rose-100"><ImageIcon size={11} className="text-rose-500"/><span className="text-[11px] font-black text-rose-700">{p.images.toLocaleString()} imgs</span></div><div className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 rounded-xl border border-indigo-100"><Video size={11} className="text-indigo-500"/><span className="text-[11px] font-black text-indigo-700">{p.videos} vids</span></div></div>
                    <ul className="space-y-1.5 mb-5 flex-grow">{p.features.map((f,i)=><li key={i} className="flex items-start gap-2 text-xs text-slate-600"><Check size={13} className="text-emerald-500 shrink-0 mt-0.5"/>{f}</li>)}</ul>
                    {p.bonus&&<div className="p-3 bg-rose-50 rounded-xl border border-rose-100 mb-4"><div className="flex items-center gap-1 text-rose-600 font-bold text-xs mb-0.5"><Sparkles size={11}/>Bonus</div><p className="text-rose-700 text-[11px] font-medium">{p.bonus}</p></div>}
                    <button onClick={()=>startCheckout(key,billingCycle)} disabled={!!checkoutLoading||isCurrent}
                      className={cn("w-full py-3.5 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-60",
                        isCurrent?"bg-emerald-100 text-emerald-700 cursor-default":p.popular?"bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-200":"bg-slate-900 hover:bg-slate-800 text-white")}>
                      {lk?<><Loader2 className="animate-spin" size={14}/>Redirecting...</>:isCurrent?<><Check size={14}/>Current Plan</>:<><CreditCard size={14}/>{stripe.ready?"Subscribe":"Setup & Subscribe"}<ArrowRight size={13}/></>}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-16">
              <div className="bg-slate-50 p-8 rounded-[32px] border border-slate-200">
                <div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 bg-rose-100 rounded-lg flex items-center justify-center text-rose-600"><Plus size={17}/></div><h3 className="text-xl font-bold text-slate-900">Top-up Packs</h3></div>
                <p className="text-slate-500 text-sm mb-5">Add quota to your current plan without upgrading.</p>
                <div className="space-y-3">{TOPUP_PACKS.map(p=>{const lk=checkoutLoading===p.key;return(<button key={p.key} onClick={()=>startCheckout("topup","monthly",p.key)} disabled={!!checkoutLoading} className={cn("w-full flex items-center justify-between p-3 bg-white rounded-xl border transition-all hover:scale-[1.01] disabled:opacity-60",p.highlight?"border-rose-200 shadow-sm":"border-slate-100 hover:border-rose-200")}><span className="text-sm font-medium text-slate-700">{p.label}{p.highlight&&<span className="text-[10px] text-rose-500 font-bold ml-2">Best Value</span>}</span><div className="flex items-center gap-2">{lk&&<Loader2 size={12} className="animate-spin text-rose-500"/>}<span className="text-base font-black text-rose-600">${p.price}</span></div></button>);})}</div>
              </div>
              <div className="bg-white p-8 rounded-[32px] border border-slate-200 flex flex-col justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Free Plan</h3>
                  <p className="text-slate-500 text-sm mb-5">Try before you commit. No credit card required.</p>
                  <ul className="space-y-2 mb-5">{["3 AI image generations","5 auto scene environments","Pinterest strategy generator","Voiceover script generator","No credit card needed"].map((f,i)=><li key={i} className="flex items-center gap-2 text-sm text-slate-600"><Check size={14} className="text-emerald-500"/>{f}</li>)}<li className="flex items-center gap-2 text-sm text-slate-400"><AlertCircle size={14} className="text-amber-400"/>Videos require a paid plan</li></ul>
                </div>
                {session.plan==="free"?<div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-700 text-sm font-bold"><Check size={15}/>You're on the free plan</div>:<button className="w-full px-8 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-2xl transition-all flex items-center justify-center gap-2">Try for Free<ArrowRight size={15}/></button>}
              </div>
            </div>
            <div className="text-center"><p className="text-xl md:text-2xl font-bold text-slate-400 italic">"Create scroll-stopping content at scale — <span className="text-slate-900">without hiring designers or editors.</span>"</p></div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-12 bg-white">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-3"><div className="w-6 h-6 bg-rose-600 rounded flex items-center justify-center text-white"><Sparkles size={12}/></div><span className="font-bold text-slate-800">PinViral</span></div>
          <p className="text-slate-400 text-sm">Built for e-commerce brands and lifestyle creators. ┬⌐ 2026 PinViral AI.</p>
          <p className="text-slate-300 text-xs mt-1 flex items-center justify-center gap-2"><CreditCard size={11}/>Stripe Test Mode · No real charges</p>
        </div>
      </footer>

      {/* Modals */}
      <AnimatePresence>{showAccountModal&&<AccountModal/>}</AnimatePresence>
      <AnimatePresence>{showUpgradeModal&&<UpgradeModal/>}</AnimatePresence>
      <AnimatePresence>{showStripeSetup&&<StripeSetupModal/>}</AnimatePresence>

      {/* Animation overlay */}
      <AnimatePresence>{(isAnimating||isExtending)&&<div className="fixed inset-0 z-[110] flex items-center justify-center bg-white/80 backdrop-blur-md"><div className="text-center space-y-4"><div className="relative w-20 h-20 mx-auto"><div className="absolute inset-0 border-4 border-rose-100 rounded-full"/><div className="absolute inset-0 border-4 border-rose-600 rounded-full border-t-transparent animate-spin"/><div className="absolute inset-0 flex items-center justify-center text-rose-600"><Wand2 size={28} className="animate-pulse"/></div></div><div><h4 className="text-lg font-bold text-slate-900">{isExtending?"Extending Video...":"Creating Magic..."}</h4><p className="text-slate-500 text-sm">~60–90 seconds</p></div></div></div>}</AnimatePresence>
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
