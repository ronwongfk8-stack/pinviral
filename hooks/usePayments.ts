// hooks/usePayment.ts
import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { CheckoutData, Plan, TopUpPack } from '@/types/billing';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface UsePaymentReturn {
  isProcessing: boolean;
  error: string | null;
  createCheckout: (data: CheckoutData) => Promise<boolean>;
  processPayment: (plan: Plan | null, addon: TopUpPack | null, email: string) => Promise<boolean>;
}

export function usePayment(): UsePaymentReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createCheckout = async (data: CheckoutData): Promise<boolean> => {
    setIsProcessing(true);
    setError(null);

    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Checkout failed');
      }

      const { sessionId } = await response.json();
      const stripe = await stripePromise;

      if (!stripe) throw new Error('Stripe failed to load');

      const { error: stripeError } = await stripe.redirectToCheckout({ sessionId });

      if (stripeError) throw new Error(stripeError.message);

      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  const processPayment = async (plan: Plan | null, addon: TopUpPack | null, email: string): Promise<boolean> => {
    if (!plan && !addon) return false;

    const data: CheckoutData = {
      mode: plan ? 'plan' : 'addon',
      planId: plan?.id,
      addonId: addon?.id,
      email
    };

    return createCheckout(data);
  };

  return {
    isProcessing,
    error,
    createCheckout,
    processPayment
  };
}