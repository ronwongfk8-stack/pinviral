// components/PaymentFlow/PlanSelector.tsx
'use client';

import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import { PLANS, TOP_UP_PACKS, Plan, TopUpPack } from '@/types/billing';

interface PlanSelectorProps {
  mode: 'plan' | 'addon';
  selectedPlan: Plan | null;
  selectedAddon: TopUpPack | null;
  onSelectPlan: (plan: Plan) => void;
  onSelectAddon: (addon: TopUpPack | null) => void;
}

export function PlanSelector({
  mode,
  selectedPlan,
  selectedAddon,
  onSelectPlan,
  onSelectAddon
}: PlanSelectorProps) {
  if (mode === 'plan') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            onClick={() => onSelectPlan(plan)}
            className={cn(
              "relative bg-white p-4 rounded-2xl border cursor-pointer transition-all",
              selectedPlan?.id === plan.id 
                ? "border-2 border-rose-600 shadow-lg" 
                : "border-slate-200 hover:border-rose-300",
              plan.popular && selectedPlan?.id !== plan.id && "border-rose-200"
            )}
          >
            {plan.popular && (
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-rose-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                Most popular
              </div>
            )}
            <div className="text-lg mb-1">{plan.emoji}</div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{plan.name}</p>
            <p className="text-xl font-black text-slate-900">
              ${plan.price}
              <span className="text-xs font-normal text-slate-400">/mo</span>
            </p>
            <ul className="mt-3 space-y-1">
              {plan.features.slice(0, 3).map((feature, idx) => (
                <li key={idx} className="text-[10px] text-slate-500 flex items-start gap-1">
                  <span className="text-emerald-500">✓</span> {feature}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
        Top-up packs (one-time)
      </p>
      {TOP_UP_PACKS.map((pack) => (
        <div
          key={pack.id}
          onClick={() => onSelectAddon(selectedAddon?.id === pack.id ? null : pack)}
          className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors"
        >
          <div>
            <span className="text-sm font-medium text-slate-700">{pack.generations} generations</span>
            <p className="text-[10px] text-slate-400">One-time purchase</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-bold text-rose-600">${pack.price}</span>
            <div
              className={cn(
                "w-4 h-4 rounded border flex items-center justify-center transition-all",
                selectedAddon?.id === pack.id 
                  ? "bg-rose-600 border-rose-600" 
                  : "border-slate-300"
              )}
            >
              {selectedAddon?.id === pack.id && <Check size={10} className="text-white" />}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}