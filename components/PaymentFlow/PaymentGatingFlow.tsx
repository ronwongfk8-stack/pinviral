// components/PaymentFlow/PaymentGatingFlow.tsx
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GateTriggerType, Plan, TopUpPack } from '@/types/billing';
import { usePayment } from '@/hooks/usePayment';
import { StepIndicator } from './StepIndicator';
import { GateBanner } from './GateBanner';
import { PlanSelector } from './PlanSelector';
import { CheckoutForm } from './CheckoutForm';
import { SuccessScreen } from './SuccessScreen';

interface PaymentGatingFlowProps {
  isOpen: boolean;
  onClose: () => void;
  triggerType: GateTriggerType;
  currentCredits: number;
  onSuccess: (creditsAdded: number, planName: string) => void;
}

export function PaymentGatingFlow({ 
  isOpen, 
  onClose, 
  triggerType, 
  currentCredits,
  onSuccess 
}: PaymentGatingFlowProps) {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<'plan' | 'addon'>('plan');
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [selectedAddon, setSelectedAddon] = useState<TopUpPack | null>(null);

  const { isProcessing, processPayment } = usePayment();

  const resetState = () => {
    setStep(0);
    setMode('plan');
    setSelectedPlan(null);
    setSelectedAddon(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handlePlanSelect = (plan: Plan) => {
    setSelectedPlan(plan);
  };

  const handleAddonSelect = (addon: TopUpPack | null) => {
    setSelectedAddon(addon);
  };

  const handleContinue = () => {
    if ((mode === 'plan' && selectedPlan) || (mode === 'addon' && selectedAddon)) {
      setStep(1);
    }
  };

  const handlePaymentSubmit = async (
    email: string, 
    cardNumber: string, 
    expiry: string, 
    cvc: string
  ) => {
    const success = await processPayment(selectedPlan, selectedAddon, email);
    if (success) {
      setStep(2);
    }
  };

  const handleSuccessClose = () => {
    const creditsAdded = mode === 'addon' 
      ? (selectedAddon?.generations || 0)
      : (selectedPlan ? getPlanCredits(selectedPlan.id) : 0);

    onSuccess(creditsAdded, selectedPlan?.name || 'Top-up');
    handleClose();
  };

  const getPlanCredits = (planId: string): number => {
    const credits: Record<string, number> = {
      starter: 50,
      pro: 150,
      scale: 400
    };
    return credits[planId] || 0;
  };

  const canContinue = mode === 'plan' 
    ? selectedPlan !== null 
    : selectedAddon !== null;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-slate-50 rounded-[32px] border border-slate-200 shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        >
          <StepIndicator currentStep={step} totalSteps={3} />

          {step === 0 && (
            <div className="p-6 space-y-6">
              <GateBanner triggerType={triggerType} currentCredits={currentCredits} />

              <div>
                <h3 className="font-bold text-slate-900 text-lg">Choose your plan</h3>
                <p className="text-slate-500 text-sm">Unlock high-converting Pinterest content at scale.</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setMode('plan')}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
                    mode === 'plan' 
                      ? "bg-rose-600 text-white" 
                      : "bg-white border border-slate-200 text-slate-600 hover:border-rose-300"
                  }`}
                >
                  Plans
                </button>
                <button
                  onClick={() => setMode('addon')}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
                    mode === 'addon' 
                      ? "bg-rose-600 text-white" 
                      : "bg-white border border-slate-200 text-slate-600 hover:border-rose-300"
                  }`}
                >
                  Top-up credits
                </button>
              </div>

              <PlanSelector
                mode={mode}
                selectedPlan={selectedPlan}
                selectedAddon={selectedAddon}
                onSelectPlan={handlePlanSelect}
                onSelectAddon={handleAddonSelect}
              />

              <div className="space-y-2">
                <button
                  onClick={handleContinue}
                  disabled={!canContinue}
                  className="w-full py-4 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 text-white font-bold rounded-2xl shadow-lg shadow-rose-200 transition-all flex items-center justify-center gap-2"
                >
                  {mode === 'plan' 
                    ? (selectedPlan ? `Continue with ${selectedPlan.name}` : 'Continue')
                    : (selectedAddon ? `Add ${selectedAddon.generations} generations` : 'Continue')
                  }
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                    <polyline points="12 5 19 12 12 19"/>
                  </svg>
                </button>
                <button
                  onClick={handleClose}
                  className="w-full py-3 text-slate-500 font-bold text-sm hover:text-slate-700 transition-colors"
                >
                  Maybe later
                </button>
              </div>
            </div>
          )}

          {step === 1 && (
            <CheckoutForm
              mode={mode}
              selectedPlan={selectedPlan}
              selectedAddon={selectedAddon}
              onBack={() => setStep(0)}
              onSubmit={handlePaymentSubmit}
              isProcessing={isProcessing}
            />
          )}

          {step === 2 && (
            <SuccessScreen
              mode={mode}
              planName={selectedPlan?.name || null}
              addonGenerations={selectedAddon?.generations || null}
              onClose={handleSuccessClose}
            />
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}