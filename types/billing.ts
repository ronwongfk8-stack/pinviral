// types/billing.ts

export interface Plan {
  id: 'starter' | 'pro' | 'scale';
  name: string;
  price: number;
  credits: number;
  features: string[];
  emoji: string;
  popular?: boolean;
}

export interface TopUpPack {
  id: string;
  generations: number;
  price: number;
}

export interface UserSubscription {
  plan: Plan['id'] | null;
  creditsRemaining: number;
  monthlyCredits: number;
  purchasedCredits: number;
  subscriptionStatus: 'active' | 'canceled' | 'past_due' | null;
  currentPeriodEnd: string | null;
}

export interface CheckoutData {
  mode: 'plan' | 'addon';
  planId?: string;
  addonId?: string;
  email: string;
  paymentMethodId?: string;
}

export type GateTriggerType = 'image' | 'video' | 'extension' | 'upgrade';

export const PLAN_CREDITS = {
  starter: 50,
  pro: 150,
  scale: 400
};

export const CREATION_COSTS = {
  IMAGE: 1,
  VIDEO: 5,
  EXTENSION: 5
};

export const TOP_UP_PACKS: TopUpPack[] = [
  { id: 'a50', generations: 50, price: 15 },
  { id: 'a100', generations: 100, price: 25 },
  { id: 'a250', generations: 250, price: 59 }
];

export const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 19,
    credits: 50,
    emoji: '🟢',
    features: [
      '50 creations/mo',
      'Pin strategy generator',
      'AI image creation',
      'Basic animation'
    ]
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 39,
    credits: 150,
    emoji: '⭐',
    popular: true,
    features: [
      '150 creations/mo',
      'Full strategy system',
      'Longer video pins',
      'Priority processing'
    ]
  },
  {
    id: 'scale',
    name: 'Scale',
    price: 79,
    credits: 400,
    emoji: '🚀',
    features: [
      '400 creations/mo',
      'Everything in Pro',
      'Video extension',
      'High priority queue'
    ]
  }
];