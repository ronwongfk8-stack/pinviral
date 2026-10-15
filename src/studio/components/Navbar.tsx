import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Type as TypeIcon,
  Palette,
  Move,
  RotateCw,
  Globe,
  Download,
  Copy,
  ChevronDown,
  Upload,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Maximize2,
  Check,
  Star,
  Layers,
  Image as ImageIcon
} from 'lucide-react';
import { AspectRatio, FontFamily, OverlayStyle, PinItem, TextOverlaySettings } from '../types';

interface NavbarProps {
  aspectRatio: AspectRatio;
  onAspectRatioChange: (ratio: AspectRatio) => void;
  pins: PinItem[];
  selectedPinId: string; // 'all' or 'pin-1'..'pin-5'
  onSelectPinId: (id: string) => void;
  onUpdateOverlay: (pinId: string, partial: Partial<TextOverlaySettings>) => void;
  onUploadImage: (file: File) => void;
  onFetchSocialProof: (url: string) => Promise<void>;
  isGenerating: boolean;
  isFetchingSocialProof: boolean;
  onDownloadAllZip: () => void;
  onCopyAllMetadata: () => void;
  onRegenerateAll: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  aspectRatio,
  onAspectRatioChange,
  pins,
  selectedPinId,
  onSelectPinId,
  onUpdateOverlay,
  onUploadImage,
  onFetchSocialProof,
  isGenerating,
  isFetchingSocialProof,
  onDownloadAllZip,
  onCopyAllMetadata,
  onRegenerateAll,
}) => {
  // Dropdown open states
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [copiedAll, setCopiedAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active overlay settings to show in dropdown controls
  const activeOverlay = selectedPinId === 'all'
    ? pins[0]?.overlay || ({} as TextOverlaySettings)
    : pins.find((p) => p.id === selectedPinId)?.overlay || pins[0]?.overlay || ({} as TextOverlaySettings);

  // Toggle dropdown
  const toggleDropdown = (name: string) => {
    setOpenDropdown((prev) => (prev === name ? null : name));
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.dropdown-container')) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadImage(file);
    }
  };

  const handleCopyAll = () => {
    onCopyAllMetadata();
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const fontOptions: { label: string; value: FontFamily }[] = [
    { label: 'Plus Jakarta (Modern)', value: 'Plus Jakarta Sans' },
    { label: 'Playfair (Luxury Serif)', value: 'Playfair Display' },
    { label: 'Caveat (Aesthetic Script)', value: 'Caveat' },
    { label: 'Cinzel (Quiet Luxury)', value: 'Cinzel' },
    { label: 'Inter (Clean Sans)', value: 'Inter' },
    { label: 'Oswald (Bold Headline)', value: 'Oswald' },
  ];

  const overlayStyles: { label: string; value: OverlayStyle }[] = [
    { label: 'Aesthetic Card', value: 'card' },
    { label: 'Bottom Gradient', value: 'bottom-gradient' },
    { label: 'Minimal Pill', value: 'minimal-pill' },
    { label: 'Full Banner', value: 'banner' },
    { label: 'Editorial Box', value: 'editorial' },
    { label: 'Clean Text', value: 'clean-text' },
  ];

  const colorPresets = [
    { name: 'White', hex: '#ffffff' },
    { name: 'Onyx', hex: '#0f172a' },
    { name: 'Terracotta', hex: '#c86d51' },
    { name: 'Amber Gold', hex: '#d97706' },
    { name: 'Forest Sage', hex: '#16a34a' },
    { name: 'Pastel Rose', hex: '#db2777' },
    { name: 'Cream Linen', hex: '#fbf8f3' },
  ];

  return (
    <header className="sticky top-16 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200 shadow-sm">
      {/* Top Main Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 via-red-500 to-amber-500 flex items-center justify-center text-white shadow-sm ring-2 ring-rose-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-xl tracking-tight text-stone-900">
                PinViral<span className="text-rose-600">.com</span>
              </span>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                Pinterest 5x Engine
              </span>
            </div>
            <p className="text-[11px] text-stone-500 hidden md:block">
              1 Image → 5 Distinct Environments, Viral Titles & SEO Metadata
            </p>
          </div>
        </div>

        {/* Aspect Ratio Switcher */}
        <div className="flex items-center bg-stone-100 p-1 rounded-xl border border-stone-200 text-xs font-semibold text-stone-700">
          <button
            onClick={() => onAspectRatioChange('9:16')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              aspectRatio === '9:16'
                ? 'bg-white text-rose-600 shadow-sm font-bold'
                : 'hover:text-stone-950 text-stone-600'
            }`}
            title="Pinterest Standard Vertical (9:16)"
          >
            <span className="inline-block w-2.5 h-4 border-2 border-current rounded-sm" />
            9:16 <span className="hidden lg:inline text-[10px] text-stone-400">(Pin)</span>
          </button>
          <button
            onClick={() => onAspectRatioChange('1:1')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              aspectRatio === '1:1'
                ? 'bg-white text-rose-600 shadow-sm font-bold'
                : 'hover:text-stone-950 text-stone-600'
            }`}
            title="Square Pin / Carousel (1:1)"
          >
            <span className="inline-block w-3.5 h-3.5 border-2 border-current rounded-sm" />
            1:1 <span className="hidden lg:inline text-[10px] text-stone-400">(Square)</span>
          </button>
          <button
            onClick={() => onAspectRatioChange('2:3')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              aspectRatio === '2:3'
                ? 'bg-white text-rose-600 shadow-sm font-bold'
                : 'hover:text-stone-950 text-stone-600'
            }`}
            title="Pinterest Classic (2:3)"
          >
            <span className="inline-block w-3 h-4 border-2 border-current rounded-sm" />
            2:3 <span className="hidden lg:inline text-[10px] text-stone-400">(Classic)</span>
          </button>
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Quick Upload Button */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-2 bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors shadow-sm"
            title="Upload single product or subject image"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Image</span>
          </button>

          {/* Download All ZIP */}
          <button
            onClick={onDownloadAllZip}
            className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors shadow-sm"
            title="Download all 5 high-resolution pins as a ZIP"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Download All 5</span>
            <span className="md:hidden">5x</span>
          </button>
        </div>
      </div>

      {/* Sub-bar with ALL the Settings Dropdowns requested by user */}
      <div className="bg-stone-50 border-t border-stone-200/80 px-4 sm:px-6 lg:px-8 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-2 text-xs">
          {/* Left: Dropdown Menus */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Target Pin Selector */}
            <div className="flex items-center bg-white px-2.5 py-1.5 rounded-lg border border-stone-200 shadow-sm">
              <span className="text-[11px] font-medium text-stone-500 mr-2">Target:</span>
              <select
                value={selectedPinId}
                onChange={(e) => onSelectPinId(e.target.value)}
                className="font-semibold text-stone-800 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="all">⚡ All 5 Pins (Global Sync)</option>
                {pins.map((pin, idx) => (
                  <option key={pin.id} value={pin.id}>
                    Pin {idx + 1}: {pin.environmentName.slice(0, 24)}...
                  </option>
                ))}
              </select>
            </div>

            {/* Dropdown 1: Edit Text */}
            <div className="relative dropdown-container">
              <button
                onClick={() => toggleDropdown('text')}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  openDropdown === 'text'
                    ? 'bg-rose-50 text-rose-700 border-rose-300'
                    : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                }`}
              >
                <TypeIcon className="w-3.5 h-3.5 text-rose-500" />
                <span>Edit Text</span>
                <ChevronDown className="w-3 h-3 text-stone-400" />
              </button>

              {openDropdown === 'text' && (
                <div className="absolute left-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-stone-200 p-4 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center justify-between pb-2 mb-3 border-b border-stone-100">
                    <span className="font-bold text-stone-800 flex items-center gap-1.5 text-xs">
                      <TypeIcon className="w-4 h-4 text-rose-600" /> Edit Text Settings
                    </span>
                    <span className="text-[11px] text-rose-600 font-medium">
                      {selectedPinId === 'all' ? 'All 5 Pins' : `Pin #${pins.findIndex((p) => p.id === selectedPinId) + 1}`}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {/* Headline */}
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                        Headline Hook
                      </label>
                      <input
                        type="text"
                        value={activeOverlay.headline}
                        onChange={(e) =>
                          onUpdateOverlay(selectedPinId, { headline: e.target.value })
                        }
                        placeholder="e.g. The Viral 2026 Find"
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 focus:outline-none focus:border-rose-500"
                      />
                    </div>

                    {/* Subtitle */}
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                        Subtitle / Value Proposition
                      </label>
                      <input
                        type="text"
                        value={activeOverlay.subtitle}
                        onChange={(e) =>
                          onUpdateOverlay(selectedPinId, { subtitle: e.target.value })
                        }
                        placeholder="e.g. Why everyone on Pinterest is saving this"
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 focus:outline-none focus:border-rose-500"
                      />
                    </div>

                    {/* Badge Pill */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-stone-600">
                          Social Proof Badge Text
                        </label>
                        <button
                          onClick={() =>
                            onUpdateOverlay(selectedPinId, { showBadge: !activeOverlay.showBadge })
                          }
                          className="text-[10px] font-medium text-rose-600 hover:underline"
                        >
                          {activeOverlay.showBadge ? 'Hide Badge' : 'Show Badge'}
                        </button>
                      </div>
                      <input
                        type="text"
                        value={activeOverlay.badgeText}
                        onChange={(e) =>
                          onUpdateOverlay(selectedPinId, { badgeText: e.target.value })
                        }
                        placeholder="e.g. ⭐ 4.9 (3.8k+ Reviews)"
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 focus:outline-none focus:border-rose-500"
                      />
                    </div>

                    {/* CTA Button */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-stone-600">
                          Call-to-Action Pill
                        </label>
                        <button
                          onClick={() =>
                            onUpdateOverlay(selectedPinId, { showCta: !activeOverlay.showCta })
                          }
                          className="text-[10px] font-medium text-rose-600 hover:underline"
                        >
                          {activeOverlay.showCta ? 'Hide CTA' : 'Show CTA'}
                        </button>
                      </div>
                      <input
                        type="text"
                        value={activeOverlay.ctaText}
                        onChange={(e) =>
                          onUpdateOverlay(selectedPinId, { ctaText: e.target.value })
                        }
                        placeholder="e.g. Tap to Shop"
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 focus:outline-none focus:border-rose-500"
                      />
                    </div>

                    {/* Text Alignment */}
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                        Alignment
                      </label>
                      <div className="grid grid-cols-3 gap-1.5 bg-stone-100 p-1 rounded-lg">
                        {(['left', 'center', 'right'] as const).map((align) => (
                          <button
                            key={align}
                            onClick={() => onUpdateOverlay(selectedPinId, { textAlign: align })}
                            className={`py-1 text-xs font-semibold capitalize rounded-md transition-all ${
                              activeOverlay.textAlign === align
                                ? 'bg-white text-stone-900 shadow-sm'
                                : 'text-stone-600 hover:text-stone-950'
                            }`}
                          >
                            {align}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Dropdown 2: Overlay & Color Settings */}
            <div className="relative dropdown-container">
              <button
                onClick={() => toggleDropdown('overlay')}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  openDropdown === 'overlay'
                    ? 'bg-rose-50 text-rose-700 border-rose-300'
                    : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                }`}
              >
                <Palette className="w-3.5 h-3.5 text-amber-500" />
                <span>Overlay & Color</span>
                <ChevronDown className="w-3 h-3 text-stone-400" />
              </button>

              {openDropdown === 'overlay' && (
                <div className="absolute left-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-stone-200 p-4 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center justify-between pb-2 mb-3 border-b border-stone-100">
                    <span className="font-bold text-stone-800 flex items-center gap-1.5 text-xs">
                      <Palette className="w-4 h-4 text-amber-500" /> Overlay & Color Themes
                    </span>
                    <span className="text-[11px] text-amber-600 font-medium">
                      Editable Colors
                    </span>
                  </div>

                  <div className="space-y-3.5">
                    {/* Overlay Style */}
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                        Overlay Frame Style
                      </label>
                      <select
                        value={activeOverlay.overlayStyle}
                        onChange={(e) =>
                          onUpdateOverlay(selectedPinId, {
                            overlayStyle: e.target.value as OverlayStyle,
                          })
                        }
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-stone-50 font-medium"
                      >
                        {overlayStyles.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Text Color */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-stone-600">
                          Text Color
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={activeOverlay.textColor}
                            onChange={(e) =>
                              onUpdateOverlay(selectedPinId, { textColor: e.target.value })
                            }
                            className="w-5 h-5 rounded-md border border-stone-300 cursor-pointer p-0"
                          />
                          <span className="text-[11px] font-mono text-stone-500">
                            {activeOverlay.textColor}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {colorPresets.map((c) => (
                          <button
                            key={c.hex}
                            onClick={() =>
                              onUpdateOverlay(selectedPinId, { textColor: c.hex })
                            }
                            className={`w-6 h-6 rounded-full border border-stone-300 transition-transform ${
                              activeOverlay.textColor.toLowerCase() === c.hex.toLowerCase()
                                ? 'scale-110 ring-2 ring-rose-500'
                                : 'hover:scale-105'
                            }`}
                            style={{ backgroundColor: c.hex }}
                            title={c.name}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Badge Pill Color */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-stone-600">
                          Badge / Accent Color
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={activeOverlay.badgeColor}
                            onChange={(e) =>
                              onUpdateOverlay(selectedPinId, { badgeColor: e.target.value })
                            }
                            className="w-5 h-5 rounded-md border border-stone-300 cursor-pointer p-0"
                          />
                          <span className="text-[11px] font-mono text-stone-500">
                            {activeOverlay.badgeColor}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {colorPresets.map((c) => (
                          <button
                            key={c.hex}
                            onClick={() =>
                              onUpdateOverlay(selectedPinId, { badgeColor: c.hex })
                            }
                            className={`w-6 h-6 rounded-full border border-stone-300 transition-transform ${
                              activeOverlay.badgeColor.toLowerCase() === c.hex.toLowerCase()
                                ? 'scale-110 ring-2 ring-rose-500'
                                : 'hover:scale-105'
                            }`}
                            style={{ backgroundColor: c.hex }}
                            title={c.name}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Card Background Color & Opacity */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-stone-600">
                          Overlay Card Background & Opacity
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={activeOverlay.overlayBgColor}
                            onChange={(e) =>
                              onUpdateOverlay(selectedPinId, { overlayBgColor: e.target.value })
                            }
                            className="w-5 h-5 rounded-md border border-stone-300 cursor-pointer p-0"
                          />
                          <span className="text-[11px] text-stone-500">
                            {Math.round(activeOverlay.overlayBgOpacity * 100)}%
                          </span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={activeOverlay.overlayBgOpacity}
                        onChange={(e) =>
                          onUpdateOverlay(selectedPinId, {
                            overlayBgOpacity: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-rose-600 cursor-pointer"
                      />
                    </div>

                    {/* Shadow Toggle */}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] font-semibold text-stone-600">
                        Drop Shadow (High Contrast)
                      </span>
                      <button
                        onClick={() =>
                          onUpdateOverlay(selectedPinId, {
                            showShadow: !activeOverlay.showShadow,
                          })
                        }
                        className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors ${
                          activeOverlay.showShadow ? 'bg-rose-600' : 'bg-stone-300'
                        }`}
                      >
                        <div
                          className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                            activeOverlay.showShadow ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Dropdown 3: Resize, Move & Rotate */}
            <div className="relative dropdown-container">
              <button
                onClick={() => toggleDropdown('transform')}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  openDropdown === 'transform'
                    ? 'bg-rose-50 text-rose-700 border-rose-300'
                    : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                }`}
              >
                <Move className="w-3.5 h-3.5 text-blue-500" />
                <span>Resize, Move & Rotate</span>
                <ChevronDown className="w-3 h-3 text-stone-400" />
              </button>

              {openDropdown === 'transform' && (
                <div className="absolute left-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-stone-200 p-4 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center justify-between pb-2 mb-3 border-b border-stone-100">
                    <span className="font-bold text-stone-800 flex items-center gap-1.5 text-xs">
                      <Move className="w-4 h-4 text-blue-500" /> Resize, Move & Rotate
                    </span>
                    <button
                      onClick={() =>
                        onUpdateOverlay(selectedPinId, {
                          positionX: 0,
                          positionY: 28,
                          rotation: 0,
                          fontSize: 32,
                        })
                      }
                      className="text-[11px] text-blue-600 font-semibold hover:underline"
                    >
                      Reset All
                    </button>
                  </div>

                  <div className="space-y-4">
                    {/* Font Family */}
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                        Font Family
                      </label>
                      <select
                        value={activeOverlay.fontFamily}
                        onChange={(e) =>
                          onUpdateOverlay(selectedPinId, {
                            fontFamily: e.target.value as FontFamily,
                          })
                        }
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-stone-50 font-medium"
                      >
                        {fontOptions.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Resize Text Slider */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-stone-600">
                          Resize Text Size
                        </label>
                        <span className="text-[11px] font-mono text-stone-700 font-bold">
                          {activeOverlay.fontSize}px
                        </span>
                      </div>
                      <input
                        type="range"
                        min="18"
                        max="56"
                        step="2"
                        value={activeOverlay.fontSize}
                        onChange={(e) =>
                          onUpdateOverlay(selectedPinId, {
                            fontSize: parseInt(e.target.value, 10),
                          })
                        }
                        className="w-full accent-blue-600 cursor-pointer"
                      />
                      <div className="flex items-center justify-between text-[10px] text-stone-400 mt-1">
                        <span>Compact (18px)</span>
                        <span>Medium (32px)</span>
                        <span>Hero (56px)</span>
                      </div>
                    </div>

                    {/* Move Text Controls: Up Down Left Right D-Pad + Sliders */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-stone-600">
                          Move Text (Up / Down / Left / Right)
                        </label>
                        <span className="text-[10px] text-stone-400">
                          X: {activeOverlay.positionX}% | Y: {activeOverlay.positionY}%
                        </span>
                      </div>

                      <div className="flex items-center gap-4 bg-stone-50 p-2.5 rounded-xl border border-stone-200">
                        {/* Interactive D-Pad */}
                        <div className="grid grid-cols-3 gap-1 w-24 mx-auto shrink-0">
                          <div />
                          <button
                            onClick={() =>
                              onUpdateOverlay(selectedPinId, {
                                positionY: Math.max(-50, activeOverlay.positionY - 6),
                              })
                            }
                            className="w-7 h-7 bg-white hover:bg-stone-200 rounded-md border border-stone-300 flex items-center justify-center text-stone-700 shadow-sm"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <div />

                          <button
                            onClick={() =>
                              onUpdateOverlay(selectedPinId, {
                                positionX: Math.max(-50, activeOverlay.positionX - 6),
                              })
                            }
                            className="w-7 h-7 bg-white hover:bg-stone-200 rounded-md border border-stone-300 flex items-center justify-center text-stone-700 shadow-sm"
                            title="Move Left"
                          >
                            <ArrowLeft className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() =>
                              onUpdateOverlay(selectedPinId, { positionX: 0, positionY: 28 })
                            }
                            className="w-7 h-7 bg-rose-50 hover:bg-rose-100 rounded-md border border-rose-200 flex items-center justify-center text-rose-600 text-[9px] font-bold"
                            title="Center Position"
                          >
                            ●
                          </button>
                          <button
                            onClick={() =>
                              onUpdateOverlay(selectedPinId, {
                                positionX: Math.min(50, activeOverlay.positionX + 6),
                              })
                            }
                            className="w-7 h-7 bg-white hover:bg-stone-200 rounded-md border border-stone-300 flex items-center justify-center text-stone-700 shadow-sm"
                            title="Move Right"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>

                          <div />
                          <button
                            onClick={() =>
                              onUpdateOverlay(selectedPinId, {
                                positionY: Math.min(50, activeOverlay.positionY + 6),
                              })
                            }
                            className="w-7 h-7 bg-white hover:bg-stone-200 rounded-md border border-stone-300 flex items-center justify-center text-stone-700 shadow-sm"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <div />
                        </div>

                        {/* Sliders */}
                        <div className="flex-1 space-y-2 text-[10px]">
                          <div>
                            <div className="flex justify-between text-stone-500 mb-0.5">
                              <span>Horizontal (X)</span>
                              <span>{activeOverlay.positionX}%</span>
                            </div>
                            <input
                              type="range"
                              min="-50"
                              max="50"
                              value={activeOverlay.positionX}
                              onChange={(e) =>
                                onUpdateOverlay(selectedPinId, {
                                  positionX: parseInt(e.target.value, 10),
                                })
                              }
                              className="w-full accent-blue-600 cursor-pointer"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between text-stone-500 mb-0.5">
                              <span>Vertical (Y)</span>
                              <span>{activeOverlay.positionY}%</span>
                            </div>
                            <input
                              type="range"
                              min="-50"
                              max="50"
                              value={activeOverlay.positionY}
                              onChange={(e) =>
                                onUpdateOverlay(selectedPinId, {
                                  positionY: parseInt(e.target.value, 10),
                                })
                              }
                              className="w-full accent-blue-600 cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Rotate Text Control */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-semibold text-stone-600 flex items-center gap-1">
                          <RotateCw className="w-3 h-3 text-stone-500" /> Rotate Text Angle
                        </label>
                        <span className="text-[11px] font-mono text-stone-700 font-bold">
                          {activeOverlay.rotation}°
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-45"
                        max="45"
                        step="1"
                        value={activeOverlay.rotation}
                        onChange={(e) =>
                          onUpdateOverlay(selectedPinId, {
                            rotation: parseInt(e.target.value, 10),
                          })
                        }
                        className="w-full accent-blue-600 cursor-pointer"
                      />
                      <div className="flex items-center justify-between gap-1 mt-1.5">
                        {[-15, -5, 0, 5, 15].map((deg) => (
                          <button
                            key={deg}
                            onClick={() => onUpdateOverlay(selectedPinId, { rotation: deg })}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors ${
                              activeOverlay.rotation === deg
                                ? 'bg-blue-600 text-white'
                                : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                            }`}
                          >
                            {deg === 0 ? '0° (Flat)' : `${deg > 0 ? '+' : ''}${deg}°`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Dropdown 4: Social Proof by URL */}
            <div className="relative dropdown-container">
              <button
                onClick={() => toggleDropdown('social')}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  openDropdown === 'social'
                    ? 'bg-rose-50 text-rose-700 border-rose-300'
                    : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                }`}
              >
                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                <span>Social Proof via URL</span>
                <ChevronDown className="w-3 h-3 text-stone-400" />
              </button>

              {openDropdown === 'social' && (
                <div className="absolute left-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-stone-200 p-4 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center justify-between pb-2 mb-3 border-b border-stone-100">
                    <span className="font-bold text-stone-800 flex items-center gap-1.5 text-xs">
                      <Globe className="w-4 h-4 text-emerald-600" /> Generate Social Proof from URL
                    </span>
                    <span className="text-[11px] text-emerald-600 font-medium">
                      AI Extraction
                    </span>
                  </div>

                  <p className="text-[11px] text-stone-500 mb-3">
                    Paste a product, store, Etsy, Amazon, or article URL. PinViral extracts customer review counts, star ratings, and viral quotes to embed on your pin overlays.
                  </p>

                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        placeholder="https://example.com/product/..."
                        className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-stone-200 focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        onClick={async () => {
                          if (urlInput.trim()) {
                            await onFetchSocialProof(urlInput.trim());
                            setOpenDropdown(null);
                          }
                        }}
                        disabled={isFetchingSocialProof || !urlInput.trim()}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 text-white font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-colors shrink-0"
                      >
                        {isFetchingSocialProof ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        <span>Extract</span>
                      </button>
                    </div>

                    <div className="pt-2 border-t border-stone-100">
                      <label className="block text-[10px] font-semibold text-stone-500 uppercase tracking-wider mb-1.5">
                        Quick Preset Social Proof Badges
                      </label>
                      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                        {[
                          '⭐ 4.9 (4,200+ Reviews)',
                          '🔥 TRENDING ON PINTEREST',
                          '✨ OVER 50,000+ SOLD',
                          '🏆 #1 VIRAL BESTSELLER',
                          '🌿 98% 5-STAR RATING',
                          '💎 AS SEEN IN VOGUE',
                        ].map((proof) => (
                          <button
                            key={proof}
                            onClick={() => {
                              onUpdateOverlay(selectedPinId, { badgeText: proof, showBadge: true });
                              setOpenDropdown(null);
                            }}
                            className="p-1.5 text-left rounded-md bg-stone-50 hover:bg-stone-100 border border-stone-200/80 text-stone-700 hover:text-stone-900 truncate"
                          >
                            {proof}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Quick Batch Actions */}
          <div className="flex items-center gap-2 ml-auto">
            {/* Re-generate All */}
            <button
              onClick={onRegenerateAll}
              disabled={isGenerating}
              className="px-3 py-1.5 bg-white hover:bg-stone-100 disabled:opacity-50 text-stone-700 border border-stone-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
              title="Regenerate all 5 pin copies and environments"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-rose-500 ${isGenerating ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Re-roll All</span>
            </button>

            {/* Copy All Metadata */}
            <button
              onClick={handleCopyAll}
              className="px-3 py-1.5 bg-white hover:bg-stone-100 text-stone-700 border border-stone-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
              title="Copy Titles, Descriptions, Boards, Alt Text & Tags for all 5 pins"
            >
              {copiedAll ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-bold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-stone-500" />
                  <span className="hidden sm:inline">Copy All SEO</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
