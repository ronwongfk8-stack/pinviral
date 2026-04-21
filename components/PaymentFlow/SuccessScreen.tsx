// components/PaymentFlow/SuccessScreen.tsx
'use client';

import { Check, Zap, ArrowRight } from 'lucide-react';
import { PLAN_CREDITS } from '@/types/billing';

interface SuccessScreenProps {
  mode: 'plan' | 'addon';
  planName: string | null;
  addonGenerations: number | null;
  onClose: () => void;
}

export function SuccessScreen({
  mode,
  planName,
  addonGenerations,
  onClose
}: SuccessScreenProps) {
  const creditsAdded = mode === 'addon' 
    ? addonGenerations 
    : (planName ? PLAN_CREDITS[planName.toLowerCase() as keyof typeof PLAN_CREDITS] : 0);

  const title = mode === 'addon' 
    ? 'Credits added!' 
    : `You're on ${planName}!`;

  const subtitle = mode === 'addon' 
    ? `${addonGenerations} new generations have been added to your account.`
    : 'Your account is now upgraded. Start creating scroll-stopping Pinterest content at scale.';

  const displayPlanName = mode === 'addon' ? 'Top-up' : planName;
  const nextRenewal = mode === 'addon' 
    ? '—' 
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });

  return (
    <div className="p-8 text-center space-y-6">
      <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
        <Check size={32} className="text-emerald-600" />
      </div>

      <div>
        <h3 className="font-bold text-slate-900 text-xl">{title}</h3>
        <p className="text-slate-500 text-sm mt-2">{subtitle}</p>
      </div>

      <div className="inline-flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-2 rounded-full font-bold text-sm">
        <Zap size={16} />
        {creditsAdded} creations added
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white p-3 rounded-xl border border-slate-200 text-left">
          <p className="text-[10px] font-bold text-slate-400 uppercase">Plan</p>
          <p className="font-bold text-slate-900">{displayPlanName}</p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-200 text-left">
          <p className="text-[10px] font-bold text-slate-400 uppercase">Billing cycle</p>
          <p className="font-bold text-slate-900">{mode === 'addon' ? '—' : 'Monthly'}</p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-200 text-left">
          <p className="text-[10px] font-bold text-slate-400 uppercase">Next renewal</p>
          <p className="font-bold text-slate-900">{nextRenewal}</p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-slate-200 text-left">
          <p className="text-[10px] font-bold text-slate-400 uppercase">Creations/mo</p>
          <p className="font-bold text-slate-900">{creditsAdded}</p>
        </div>
      </div>

      <button
        onClick={onClose}
        className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-2xl shadow-lg shadow-rose-200 transition-all flex items-center justify-center gap-2"
      >
        Start creating
        <ArrowRight size={18} />
      </button>
    </div>
  );
}