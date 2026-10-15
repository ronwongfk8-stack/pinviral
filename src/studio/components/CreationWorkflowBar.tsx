import React, { useRef } from 'react';
import {
  Upload,
  Sparkles,
  Link2,
  Tag,
  ImageIcon,
  RefreshCw,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';

interface CreationWorkflowBarProps {
  productTitle: string;
  onProductTitleChange: (title: string) => void;
  productUrl: string;
  onProductUrlChange: (url: string) => void;
  subjectImageUrl: string;
  onUploadImage: (file: File) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

export const CreationWorkflowBar: React.FC<CreationWorkflowBarProps> = ({
  productTitle,
  onProductTitleChange,
  productUrl,
  onProductUrlChange,
  subjectImageUrl,
  onUploadImage,
  onGenerate,
  isGenerating,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadImage(file);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-stone-200/90 shadow-md p-4 sm:p-5 mb-8 transition-all">
      {/* Workflow Step Indicators */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-stone-100 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-rose-600 text-white font-extrabold text-xs flex items-center justify-center">
            ⚡
          </span>
          <span className="font-extrabold text-sm text-stone-900 tracking-tight">
            PinViral Creation Workflow
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <span>🌐 Web Buyer Research</span>
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span>🔒 100% Product-Locked</span>
          </span>
          <span className="text-xs text-stone-400 hidden sm:inline">
            — Upload Image → Title → URL → Generate 5 Scenes
          </span>
        </div>
      </div>

      {/* The 4 Workflow Steps Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-center">
        {/* Step 1: Upload Image */}
        <div className="md:col-span-3">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-1.5 flex items-center gap-1">
            <span className="w-4 h-4 rounded-full bg-stone-800 text-white text-[10px] flex items-center justify-center font-bold">
              1
            </span>
            Upload Image
          </label>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-11 px-3 bg-stone-50 hover:bg-stone-100 border border-stone-200 hover:border-stone-300 rounded-xl flex items-center gap-2.5 transition-all text-left group"
          >
            {subjectImageUrl ? (
              <img
                src={subjectImageUrl}
                alt="Product thumbnail"
                className="w-8 h-8 rounded-lg object-cover border border-stone-200 shrink-0 shadow-sm"
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-stone-200 flex items-center justify-center text-stone-500 shrink-0">
                <ImageIcon className="w-4 h-4" />
              </div>
            )}
            <div className="truncate flex-1">
              <div className="text-xs font-semibold text-stone-800 truncate group-hover:text-rose-600">
                {subjectImageUrl ? 'Change Image' : 'Select Product Image'}
              </div>
              <div className="text-[10px] text-stone-400">PNG, JPG, WEBP</div>
            </div>
            <Upload className="w-3.5 h-3.5 text-stone-400 group-hover:text-rose-600 shrink-0" />
          </button>
        </div>

        {/* Step 2: Upload Title (identifies what product it is) */}
        <div className="md:col-span-3">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-1.5 flex items-center gap-1">
            <span className="w-4 h-4 rounded-full bg-stone-800 text-white text-[10px] flex items-center justify-center font-bold">
              2
            </span>
            Product Title <span className="text-stone-400 lowercase font-normal">(identifies product)</span>
          </label>
          <div className="relative">
            <Tag className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-3.5 pointer-events-none" />
            <input
              type="text"
              value={productTitle}
              onChange={(e) => onProductTitleChange(e.target.value)}
              placeholder="e.g. Artisan Ceramic Latte Mug"
              className="w-full h-11 pl-9 pr-3 text-xs font-semibold text-stone-900 bg-stone-50 hover:bg-white focus:bg-white rounded-xl border border-stone-200 focus:outline-none focus:border-rose-500 transition-all placeholder:font-normal placeholder:text-stone-400"
            />
          </div>
        </div>

        {/* Step 3: Upload URL for Social Proof */}
        <div className="md:col-span-3">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-1.5 flex items-center gap-1">
            <span className="w-4 h-4 rounded-full bg-stone-800 text-white text-[10px] flex items-center justify-center font-bold">
              3
            </span>
            URL for Social Proof <span className="text-stone-400 lowercase font-normal">(reviews/quotes)</span>
          </label>
          <div className="relative">
            <Link2 className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-3.5 pointer-events-none" />
            <input
              type="url"
              value={productUrl}
              onChange={(e) => onProductUrlChange(e.target.value)}
              placeholder="e.g. https://shop.com/product"
              className="w-full h-11 pl-9 pr-3 text-xs text-stone-900 bg-stone-50 hover:bg-white focus:bg-white rounded-xl border border-stone-200 focus:outline-none focus:border-rose-500 transition-all placeholder:text-stone-400"
            />
          </div>
        </div>

        {/* Step 4: The Generate Button */}
        <div className="md:col-span-3">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-rose-600 mb-1.5 flex items-center gap-1">
            <span className="w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] flex items-center justify-center font-bold">
              4
            </span>
            Generate Output Images
          </label>
          <button
            onClick={onGenerate}
            disabled={isGenerating || !subjectImageUrl}
            className="w-full h-11 px-4 bg-gradient-to-r from-rose-600 via-red-500 to-amber-500 hover:from-rose-700 hover:to-amber-600 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-[0.99] cursor-pointer"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>Generating 5 Pins...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-200 fill-amber-200" />
                <span>Generate 5 Pins</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
