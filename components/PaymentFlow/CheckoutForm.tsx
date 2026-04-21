// components/PaymentFlow/CheckoutForm.tsx
'use client';

import { useState } from 'react';
import { CreditCard, Lock, Loader2 } from 'lucide-react';
import { Plan, TopUpPack } from '@/types/billing';

interface CheckoutFormProps {
  mode: 'plan' | 'addon';
  selectedPlan: Plan | null;
  selectedAddon: TopUpPack | null;
  onBack: () => void;
  onSubmit: (email: string, cardNumber: string, expiry: string, cvc: string) => void;
  isProcessing: boolean;
}

export function CheckoutForm({
  mode,
  selectedPlan,
  selectedAddon,
  onBack,
  onSubmit,
  isProcessing
}: CheckoutFormProps) {
  const [email, setEmail] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');

  const formatCard = (value: string) => {
    const v = value.replace(/\D/g, '').slice(0, 16);
    return v.replace(/(.{4})/g, '$1 ').trim();
  };

  const formatExpiry = (value: string) => {
    const v = value.replace(/\D/g, '').slice(0, 4);
    if (v.length > 2) return v.slice(0, 2) + ' / ' + v.slice(2);
    return v;
  };

  const isFormValid = 
    email.includes('@') && 
    cardNumber.replace(/\s/g, '').length === 16 && 
    expiry.length === 7 && 
    cvc.length === 3;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isFormValid && !isProcessing) {
      onSubmit(email, cardNumber, expiry, cvc);
    }
  };

  const itemName = mode === 'plan' 
    ? `${selectedPlan?.name} plan` 
    : `${selectedAddon?.generations} generations`;

  const itemPrice = mode === 'plan' 
    ? `$${selectedPlan?.price}/mo` 
    : `$${selectedAddon?.price}`;

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6">
      <div>
        <h3 className="font-bold text-slate-900 text-lg">Checkout</h3>
        <p className="text-slate-500 text-sm">Review your order and enter payment details.</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Order summary</p>
        <div className="flex justify-between items-center text-sm">
          <span className="text-slate-600">{itemName}</span>
          <span className="font-bold text-slate-900">{itemPrice}</span>
        </div>
        <div className="h-px bg-slate-100" />
        <div className="flex justify-between items-center">
          <span className="font-bold text-slate-900">Total today</span>
          <span className="font-black text-slate-900 text-lg">
            ${mode === 'plan' ? selectedPlan?.price : selectedAddon?.price}
          </span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Payment details</p>

        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1.5">Email address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-500 block mb-1.5">Card number</label>
          <div className="relative">
            <CreditCard size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={cardNumber}
              onChange={(e) => setCardNumber(formatCard(e.target.value))}
              placeholder="1234 5678 9012 3456"
              maxLength={19}
              required
              className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1.5">Expiry</label>
            <input
              type="text"
              value={expiry}
              onChange={(e) => setExpiry(formatExpiry(e.target.value))}
              placeholder="MM / YY"
              maxLength={7}
              required
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1.5">CVC</label>
            <input
              type="text"
              value={cvc}
              onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 3))}
              placeholder="123"
              maxLength={3}
              required
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <button
          type="submit"
          disabled={!isFormValid || isProcessing}
          className="w-full py-4 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 text-white font-bold rounded-2xl shadow-lg shadow-rose-200 transition-all flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <><Loader2 size={18} className="animate-spin" /> Processing…</>
          ) : (
            <><Lock size={18} /> Pay now</>
          )}
        </button>
        <button
          type="button"
          onClick={onBack}
          disabled={isProcessing}
          className="w-full py-3 text-slate-500 font-bold text-sm hover:text-slate-700 transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
        >
          ← Back to plans
        </button>
      </div>
    </form>
  );
}