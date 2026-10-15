import React, { useState } from 'react';
import {
  X,
  Share2,
  Bookmark,
  Heart,
  MoreHorizontal,
  ExternalLink,
  Search,
  MessageCircle,
  Sparkles,
  Smartphone,
  Monitor
} from 'lucide-react';
import { AspectRatio, PinItem } from '../types';

interface PinterestPreviewModalProps {
  pin: PinItem | null;
  aspectRatio: AspectRatio;
  productImage: string;
  onClose: () => void;
}

export const PinterestPreviewModal: React.FC<PinterestPreviewModalProps> = ({
  pin,
  aspectRatio,
  productImage,
  onClose,
}) => {
  const [deviceMode, setDeviceMode] = useState<'mobile' | 'desktop'>('mobile');
  const [isSaved, setIsSaved] = useState(false);

  if (!pin) return null;

  return (
    <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-stone-200">
        {/* Modal Top Bar */}
        <div className="px-6 py-3.5 border-b border-stone-200 flex items-center justify-between bg-stone-50">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center text-white font-bold text-sm">
              P
            </div>
            <div>
              <span className="font-bold text-sm text-stone-900">
                Pinterest Feed Simulator
              </span>
              <span className="ml-2 text-xs text-stone-500 hidden sm:inline">
                Live Preview: {pin.environmentName}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Device Toggle */}
            <div className="flex items-center bg-stone-200/80 p-0.5 rounded-lg text-xs font-semibold text-stone-700">
              <button
                onClick={() => setDeviceMode('mobile')}
                className={`px-2.5 py-1 rounded-md flex items-center gap-1 transition-all ${
                  deviceMode === 'mobile' ? 'bg-white shadow-sm text-rose-600 font-bold' : 'text-stone-600'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Mobile Feed</span>
              </button>
              <button
                onClick={() => setDeviceMode('desktop')}
                className={`px-2.5 py-1 rounded-md flex items-center gap-1 transition-all ${
                  deviceMode === 'desktop' ? 'bg-white shadow-sm text-rose-600 font-bold' : 'text-stone-600'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>Desktop Pin</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 hover:bg-stone-200 rounded-full text-stone-500 hover:text-stone-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-stone-100 flex items-center justify-center">
          {deviceMode === 'mobile' ? (
            /* Mobile Feed Mockup */
            <div className="w-[360px] bg-white rounded-[38px] shadow-2xl border-[6px] border-stone-800 overflow-hidden flex flex-col">
              {/* Phone Status Bar */}
              <div className="h-7 bg-stone-900 flex items-center justify-between px-6 text-white text-[11px] font-medium">
                <span>9:41</span>
                <div className="w-16 h-3.5 bg-black rounded-full" />
                <div className="flex items-center gap-1">
                  <span>5G</span>
                  <div className="w-4 h-2 border border-white rounded-sm" />
                </div>
              </div>

              {/* Pinterest Mobile Header */}
              <div className="px-4 py-2 border-b border-stone-100 flex items-center justify-between text-xs">
                <span className="font-bold text-stone-800 text-sm">For You</span>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-stone-100 flex items-center justify-center text-stone-600">
                    <Search className="w-3.5 h-3.5" />
                  </div>
                  <div className="w-6 h-6 rounded-full bg-stone-100 flex items-center justify-center text-stone-600">
                    <MessageCircle className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>

              {/* Feed Card */}
              <div className="p-3 bg-stone-50 flex-1 overflow-y-auto">
                <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-stone-200">
                  {/* Pin Image Container */}
                  <div className="relative overflow-hidden bg-stone-200">
                    <div
                      className={`relative w-full ${
                        aspectRatio === '9:16'
                          ? 'aspect-[9/16]'
                          : aspectRatio === '2:3'
                          ? 'aspect-[2/3]'
                          : 'aspect-square'
                      }`}
                    >
                      {/* Stylized rendering inside preview */}
                      <div
                        className="absolute inset-0 flex flex-col items-center justify-center bg-cover bg-center"
                        style={{
                          backgroundImage: pin.generatedImageUrl
                            ? `url("${pin.generatedImageUrl}")`
                            : `linear-gradient(135deg, ${pin.environmentColorTheme.backgroundPrimary}, ${pin.environmentColorTheme.backgroundSecondary})`,
                        }}
                      >
                        {!pin.generatedImageUrl && productImage && (
                          <div className="relative z-10 flex items-center justify-center p-2 mb-10">
                            <img
                              src={productImage}
                              alt={pin.altText}
                              className="max-w-[72%] max-h-[48%] object-contain drop-shadow-[0_20px_25px_rgba(0,0,0,0.6)]"
                            />
                          </div>
                        )}

                        {/* Overlay text simulation */}
                        <div
                          className="absolute w-[86%] rounded-xl p-2.5 text-center shadow-md"
                          style={{
                            bottom: `${20 - pin.overlay.positionY / 4}%`,
                            backgroundColor: pin.overlay.overlayBgColor,
                            color: pin.overlay.textColor,
                            transform: `rotate(${pin.overlay.rotation}deg)`,
                          }}
                        >
                          {pin.overlay.showBadge && (
                            <span
                              className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold text-white mb-1"
                              style={{ backgroundColor: pin.overlay.badgeColor }}
                            >
                              {pin.overlay.badgeText}
                            </span>
                          )}
                          <div className="font-bold text-xs leading-tight">
                            {pin.overlay.headline}
                          </div>
                          <div className="text-[10px] opacity-80 mt-0.5 line-clamp-1">
                            {pin.overlay.subtitle}
                          </div>
                        </div>
                      </div>

                      {/* Pinterest Quick Save Overlay */}
                      <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                        <button
                          onClick={() => setIsSaved(!isSaved)}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all shadow-md ${
                            isSaved ? 'bg-stone-900 text-white' : 'bg-red-600 hover:bg-red-700 text-white'
                          }`}
                        >
                          {isSaved ? 'Saved ✓' : 'Save'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Pin Details */}
                  <div className="p-3">
                    <div className="font-bold text-xs text-stone-900 leading-snug line-clamp-2">
                      {pin.title}
                    </div>
                    <div className="text-[11px] text-stone-600 mt-1 line-clamp-2">
                      {pin.seoDescription}
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500">
                      <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                          P
                        </div>
                        <span className="font-semibold text-stone-800">PinViral Creator</span>
                      </div>
                      <span className="text-stone-400">Board: {pin.board}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Desktop Full Pin Modal */
            <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl border border-stone-200 overflow-hidden flex flex-col md:flex-row">
              {/* Left: Image */}
              <div className="md:w-1/2 bg-stone-100 flex items-center justify-center p-4">
                <div
                  className={`w-full rounded-2xl overflow-hidden shadow-md ${
                    aspectRatio === '9:16'
                      ? 'aspect-[9/16]'
                      : aspectRatio === '2:3'
                      ? 'aspect-[2/3]'
                      : 'aspect-square'
                  } relative flex flex-col items-center justify-center`}
                  style={{
                    backgroundImage: pin.generatedImageUrl
                      ? `url("${pin.generatedImageUrl}")`
                      : `linear-gradient(135deg, ${pin.environmentColorTheme.backgroundPrimary}, ${pin.environmentColorTheme.backgroundSecondary})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }}
                >
                  {!pin.generatedImageUrl && productImage && (
                    <div className="relative z-10 flex items-center justify-center p-3 mb-12">
                      <img
                        src={productImage}
                        alt={pin.altText}
                        className="max-w-[75%] max-h-[52%] object-contain drop-shadow-[0_20px_25px_rgba(0,0,0,0.65)]"
                      />
                    </div>
                  )}
                  <div
                    className="absolute w-[86%] rounded-xl p-3 text-center shadow-lg"
                    style={{
                      bottom: `${20 - pin.overlay.positionY / 4}%`,
                      backgroundColor: pin.overlay.overlayBgColor,
                      color: pin.overlay.textColor,
                      transform: `rotate(${pin.overlay.rotation}deg)`,
                    }}
                  >
                    {pin.overlay.showBadge && (
                      <span
                        className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white mb-1"
                        style={{ backgroundColor: pin.overlay.badgeColor }}
                      >
                        {pin.overlay.badgeText}
                      </span>
                    )}
                    <div className="font-bold text-sm leading-tight">
                      {pin.overlay.headline}
                    </div>
                    <div className="text-xs opacity-80 mt-1 line-clamp-1">
                      {pin.overlay.subtitle}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Full Details */}
              <div className="md:w-1/2 p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <button className="p-2 hover:bg-stone-100 rounded-full text-stone-600">
                        <Share2 className="w-4 h-4" />
                      </button>
                      <button className="p-2 hover:bg-stone-100 rounded-full text-stone-600">
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-stone-600">
                        {pin.board}
                      </span>
                      <button
                        onClick={() => setIsSaved(!isSaved)}
                        className={`px-4 py-2 rounded-full text-xs font-bold transition-all shadow-sm ${
                          isSaved ? 'bg-stone-900 text-white' : 'bg-red-600 hover:bg-red-700 text-white'
                        }`}
                      >
                        {isSaved ? 'Saved ✓' : 'Save'}
                      </button>
                    </div>
                  </div>

                  <h2 className="text-lg font-extrabold text-stone-900 leading-snug mb-2">
                    {pin.title}
                  </h2>
                  <p className="text-xs text-stone-600 leading-relaxed mb-4">
                    {pin.seoDescription}
                  </p>

                  <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs mb-4">
                    <div className="font-bold text-stone-700 mb-1">Alt Text (Search & Accessibility):</div>
                    <div className="text-stone-500 italic text-[11px]">{pin.altText}</div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {pin.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-100 text-stone-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-rose-600 text-white font-bold text-xs flex items-center justify-center">
                      PV
                    </div>
                    <div>
                      <div className="font-bold text-stone-800">PinViral Verified</div>
                      <div className="text-[10px]">124k monthly views</div>
                    </div>
                  </div>
                  <button className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 rounded-full font-bold text-stone-800 text-xs">
                    Follow
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
