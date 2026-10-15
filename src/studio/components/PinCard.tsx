import React, { useRef, useEffect, useState } from 'react';
import {
  Download,
  Copy,
  Check,
  Eye,
  Sliders,
  Hash,
  FileText,
  Bookmark,
  Accessibility,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { AspectRatio, PinItem, TextOverlaySettings } from '../types';
import { PHOTOGRAPHIC_SCENES } from '../data/samples';
import {
  drawGeneratedPhoto,
  drawTextOverlay,
  getDimensions,
} from '../utils/canvasRenderer';

interface PinCardProps {
  pin: PinItem;
  index: number;
  aspectRatio: AspectRatio;
  hasGenerated: boolean;
  isGenerating: boolean;
  onUpdatePin: (pinId: string, updates: Partial<PinItem>) => void;
  onSelectForEdit: (pinId: string) => void;
  onOpenPreview: (pin: PinItem) => void;
  onRegenerateImage: (pinId: string, sceneId?: string) => void;
}

export const PinCard: React.FC<PinCardProps> = ({
  pin,
  index,
  aspectRatio,
  hasGenerated,
  isGenerating,
  onUpdatePin,
  onSelectForEdit,
  onOpenPreview,
  onRegenerateImage,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showMetadata, setShowMetadata] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [bgImageElement, setBgImageElement] = useState<HTMLImageElement | null>(null);
  const [showSceneMenu, setShowSceneMenu] = useState(false);

  // Load the AI-generated lifestyle photo (product intact in a real scene)
  useEffect(() => {
    if (!pin.generatedImageUrl) {
      setBgImageElement(null);
      return;
    }
    const img = new Image();
    img.onload = () => setBgImageElement(img);
    img.src = pin.generatedImageUrl;
  }, [pin.generatedImageUrl]);

  // Render canvas only once the generated photo exists: photo + text overlay, no cutouts
  useEffect(() => {
    if (!hasGenerated || !bgImageElement) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = getDimensions(aspectRatio);
    canvas.width = width;
    canvas.height = height;

    drawGeneratedPhoto(ctx, bgImageElement, width, height);
    drawTextOverlay(ctx, width, height, pin.overlay);
  }, [pin.overlay, aspectRatio, hasGenerated, bgImageElement]);

  // Copy helper
  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 1800);
  };

  // Copy complete Pinterest package for this pin
  const copyCompletePin = () => {
    const fullText = `📌 PINTEREST PIN PACKAGE #${index + 1}
━━━━━━━━━━━━━━━━━━━━━━━━━━━
TITLE:
${pin.title}

SEO DESCRIPTION:
${pin.seoDescription}

RECOMMENDED BOARD:
${pin.board}

ALT TEXT:
${pin.altText}

SEARCH TAGS:
${pin.tags.join(' ')}
`;
    copyToClipboard(fullText, 'full');
  };

  // Download high-resolution PNG
  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsDownloading(true);

    try {
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const link = document.createElement('a');
      const safeTitle = pin.title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
      link.download = `PinViral_${index + 1}_${pin.environmentStyle}_${safeTitle}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  // Aspect ratio class helper for the canvas container
  const getAspectRatioClasses = () => {
    switch (aspectRatio) {
      case '9:16':
        return 'aspect-[9/16]';
      case '2:3':
        return 'aspect-[2/3]';
      case '1:1':
      default:
        return 'aspect-square';
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-stone-200 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col group">
      {/* Pin Card Header / Environment Badge */}
      <div className="px-3.5 py-2.5 bg-stone-50/80 border-b border-stone-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 truncate">
          <span className="w-5 h-5 rounded-full bg-rose-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0">
            {index + 1}
          </span>
          <span className="font-bold text-xs text-stone-800 truncate" title={pin.environmentName}>
            {pin.environmentName}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Scene Dropdown Switcher */}
          <div className="relative">
            <button
              onClick={() => setShowSceneMenu(!showSceneMenu)}
              className="text-[10px] font-semibold text-stone-700 hover:text-stone-900 bg-white hover:bg-stone-100 border border-stone-200 px-2 py-1 rounded-md flex items-center gap-1 shadow-sm transition-colors"
              title="Regenerate this image in a different setting"
            >
              <span>Scene</span>
              <ChevronDown className="w-3 h-3 text-stone-400" />
            </button>

            {showSceneMenu && (
              <div className="absolute right-0 mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-stone-200 p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="text-[10px] font-bold text-stone-400 uppercase px-1.5 py-1">
                  Re-shoot in another setting:
                </div>
                <div className="space-y-1">
                  {PHOTOGRAPHIC_SCENES.map((scene) => (
                    <button
                      key={scene.id}
                      onClick={() => {
                        onRegenerateImage(pin.id, scene.id);
                        setShowSceneMenu(false);
                      }}
                      className={`w-full flex items-center gap-2 p-1.5 rounded-lg text-left transition-colors ${
                        pin.environmentStyle === scene.style
                          ? 'bg-rose-50 border border-rose-200'
                          : 'hover:bg-stone-50'
                      }`}
                    >
                      <img
                        src={scene.imageUrl}
                        alt={scene.name}
                        className="w-7 h-7 rounded-md object-cover shrink-0 shadow-sm"
                      />
                      <div className="truncate flex-1">
                        <div className="text-xs font-semibold text-stone-800 truncate">
                          {scene.name}
                        </div>
                        <div className="text-[9px] text-stone-400 truncate">
                          {scene.tagline}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => onSelectForEdit(pin.id)}
            className="text-[10px] font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-1 rounded-md flex items-center gap-1 transition-colors"
            title="Customize text, overlay, move & rotate for this pin"
          >
            <Sliders className="w-3 h-3" />
            <span>Edit</span>
          </button>
        </div>
      </div>

      {/* Main Visual: Canvas Display or Waiting Placeholder */}
      <div className={`relative bg-stone-100 overflow-hidden w-full ${getAspectRatioClasses()}`}>
        {hasGenerated && pin.imageStatus === 'loading' ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-rose-50/60">
            <div className="flex flex-col items-center gap-3 animate-pulse">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center">
                <Sparkles className="w-6 h-6 animate-spin" />
              </div>
              <div className="font-bold text-xs text-rose-700">Creating image #{index + 1}...</div>
              <div className="text-[11px] text-stone-500 max-w-[200px]">
                Placing your product in a new setting
              </div>
            </div>
          </div>
        ) : hasGenerated && (pin.imageStatus === 'error' || pin.imageStatus === 'nocredit') ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-stone-50 gap-2">
            <div className="font-bold text-xs text-stone-800">{pin.imageStatus === 'nocredit' ? 'Out of credits' : 'Image failed'}</div>
            <div className="text-[10px] text-stone-500 max-w-[200px]">{pin.imageStatus === 'nocredit' ? 'Upgrade or top up to create this image.' : pin.imageError}</div>
            <button
              onClick={() => onRegenerateImage(pin.id)}
              className="mt-1 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold"
            >
              {pin.imageStatus === 'nocredit' ? 'Generate (1 credit)' : 'Try again'}
            </button>
          </div>
        ) : hasGenerated ? (
          <>
            <canvas
              ref={canvasRef}
              className="w-full h-full object-contain select-none"
            />

            {/* Hover Action Overlay */}
            <div className="absolute inset-0 bg-stone-950/40 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[2px] flex items-center justify-center gap-3 p-4">
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="p-3 bg-white hover:bg-stone-100 text-stone-900 rounded-2xl shadow-lg transition-transform hover:scale-105 flex flex-col items-center gap-1 text-xs font-bold"
                title="Download crisp 2x PNG"
              >
                <Download className="w-4 h-4 text-rose-600" />
                <span>Download</span>
              </button>

              <button
                onClick={() => onOpenPreview(pin)}
                className="p-3 bg-white hover:bg-stone-100 text-stone-900 rounded-2xl shadow-lg transition-transform hover:scale-105 flex flex-col items-center gap-1 text-xs font-bold"
                title="Preview in authentic Pinterest feed"
              >
                <Eye className="w-4 h-4 text-amber-600" />
                <span>Feed View</span>
              </button>

              <button
                onClick={() => onRegenerateImage(pin.id)}
                className="p-3 bg-white hover:bg-stone-100 text-stone-900 rounded-2xl shadow-lg transition-transform hover:scale-105 flex flex-col items-center gap-1 text-xs font-bold"
                title="Regenerate this image"
              >
                <Sparkles className="w-4 h-4 text-rose-600" />
                <span>Redo</span>
              </button>

              <button
                onClick={copyCompletePin}
                className="p-3 bg-white hover:bg-stone-100 text-stone-900 rounded-2xl shadow-lg transition-transform hover:scale-105 flex flex-col items-center gap-1 text-xs font-bold"
                title="Copy Title, SEO Description, Board, Alt text, and Tags"
              >
                {copiedField === 'full' ? (
                  <Check className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Copy className="w-4 h-4 text-blue-600" />
                )}
                <span>{copiedField === 'full' ? 'Copied!' : 'Copy SEO'}</span>
              </button>
            </div>
          </>
        ) : (
          /* Placeholder Slot (No image shown until generated) */
          <div
            className="w-full h-full flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-stone-300/80 transition-all"
            style={{
              backgroundColor: isGenerating ? '#fef2f2' : '#fafaf9',
            }}
          >
            {isGenerating ? (
              <div className="flex flex-col items-center gap-3 animate-pulse">
                <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shadow-sm">
                  <Sparkles className="w-6 h-6 animate-spin text-rose-600" />
                </div>
                <div className="font-bold text-xs text-rose-700">
                  Synthesizing Pin #{index + 1}...
                </div>
                <div className="text-[11px] text-stone-500 max-w-[200px]">
                  Generating {pin.environmentName} background & SEO
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2.5">
                <div className="w-12 h-12 rounded-2xl bg-stone-100 border border-stone-200 text-stone-400 flex items-center justify-center group-hover:text-rose-500 group-hover:border-rose-200 transition-colors">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="font-extrabold text-xs text-stone-800">
                  Pin Slot #{index + 1}
                </div>
                <div className="text-[11px] font-semibold text-rose-600">
                  {pin.environmentName}
                </div>
                <div className="text-[10px] text-stone-400 mt-1 max-w-[170px] leading-relaxed">
                  Waiting for generation. Click &ldquo;Generate 5 Pins&rdquo; above.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pin Card Quick Bar */}
      <div className="px-4 py-2 bg-stone-50 border-t border-b border-stone-200/60 flex items-center justify-between text-xs">
        <button
          onClick={() => setShowMetadata(!showMetadata)}
          className="font-bold text-stone-700 hover:text-stone-950 flex items-center gap-1.5"
        >
          <FileText className="w-3.5 h-3.5 text-rose-600" />
          <span>Pinterest SEO Details</span>
          {showMetadata ? (
            <ChevronUp className="w-3 h-3 text-stone-400" />
          ) : (
            <ChevronDown className="w-3 h-3 text-stone-400" />
          )}
        </button>

        {hasGenerated && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleDownload}
              className="px-2.5 py-1 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg text-[11px] font-semibold text-stone-700 flex items-center gap-1 shadow-sm"
            >
              <Download className="w-3 h-3 text-rose-600" />
              <span>PNG</span>
            </button>
            <button
              onClick={copyCompletePin}
              className="px-2.5 py-1 bg-white hover:bg-stone-100 border border-stone-200 rounded-lg text-[11px] font-semibold text-stone-700 flex items-center gap-1 shadow-sm"
            >
              {copiedField === 'full' ? (
                <Check className="w-3 h-3 text-emerald-600" />
              ) : (
                <Copy className="w-3 h-3 text-stone-600" />
              )}
              <span>{copiedField === 'full' ? 'Copied' : 'Copy All'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Complete SEO Metadata Section */}
      {showMetadata && (
        hasGenerated ? (
          <div className="p-4 space-y-3.5 text-xs flex-1 bg-white">
          {/* 1. Title */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-stone-600 flex items-center gap-1 text-[11px] uppercase tracking-wide">
                <Bookmark className="w-3 h-3 text-rose-500" /> Title
              </span>
              <button
                onClick={() => copyToClipboard(pin.title, 'title')}
                className="text-[11px] text-stone-500 hover:text-rose-600 flex items-center gap-1"
                title="Copy Title"
              >
                {copiedField === 'title' ? (
                  <Check className="w-3 h-3 text-emerald-600" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                <span>{copiedField === 'title' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <input
              type="text"
              value={pin.title}
              onChange={(e) => onUpdatePin(pin.id, { title: e.target.value })}
              className="w-full px-2.5 py-1.5 text-xs font-semibold text-stone-900 rounded-lg border border-stone-200 bg-stone-50/60 focus:bg-white focus:outline-none focus:border-rose-500"
            />
          </div>

          {/* 2. SEO Description */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-stone-600 flex items-center gap-1 text-[11px] uppercase tracking-wide">
                <FileText className="w-3 h-3 text-amber-500" /> SEO Description
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-stone-400">
                  {pin.seoDescription.length} chars
                </span>
                <button
                  onClick={() => copyToClipboard(pin.seoDescription, 'description')}
                  className="text-[11px] text-stone-500 hover:text-rose-600 flex items-center gap-1"
                  title="Copy SEO Description"
                >
                  {copiedField === 'description' ? (
                    <Check className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span>{copiedField === 'description' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
            <textarea
              rows={3}
              value={pin.seoDescription}
              onChange={(e) => onUpdatePin(pin.id, { seoDescription: e.target.value })}
              className="w-full px-2.5 py-1.5 text-xs text-stone-800 rounded-lg border border-stone-200 bg-stone-50/60 focus:bg-white focus:outline-none focus:border-rose-500 resize-none leading-relaxed"
            />
          </div>

          {/* 3. Recommended Board & Alt Text Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Board */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-stone-600 flex items-center gap-1 text-[11px] uppercase tracking-wide">
                  <Bookmark className="w-3 h-3 text-purple-500" /> Target Board
                </span>
                <button
                  onClick={() => copyToClipboard(pin.board, 'board')}
                  className="text-[10px] text-stone-400 hover:text-rose-600"
                >
                  {copiedField === 'board' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <input
                type="text"
                value={pin.board}
                onChange={(e) => onUpdatePin(pin.id, { board: e.target.value })}
                className="w-full px-2.5 py-1 text-xs text-stone-800 rounded-lg border border-stone-200 bg-stone-50/60 focus:bg-white focus:outline-none focus:border-rose-500"
              />
            </div>

            {/* Alt Text */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-stone-600 flex items-center gap-1 text-[11px] uppercase tracking-wide">
                  <Accessibility className="w-3 h-3 text-emerald-500" /> Alt Text (SEO)
                </span>
                <button
                  onClick={() => copyToClipboard(pin.altText, 'alt')}
                  className="text-[10px] text-stone-400 hover:text-rose-600"
                >
                  {copiedField === 'alt' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <input
                type="text"
                value={pin.altText}
                onChange={(e) => onUpdatePin(pin.id, { altText: e.target.value })}
                className="w-full px-2.5 py-1 text-xs text-stone-800 rounded-lg border border-stone-200 bg-stone-50/60 focus:bg-white focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>

          {/* 4. Tags */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-stone-600 flex items-center gap-1 text-[11px] uppercase tracking-wide">
                <Hash className="w-3 h-3 text-blue-500" /> Search Tags ({pin.tags.length})
              </span>
              <button
                onClick={() => copyToClipboard(pin.tags.join(' '), 'tags')}
                className="text-[11px] text-stone-500 hover:text-rose-600 flex items-center gap-1"
                title="Copy all tags"
              >
                {copiedField === 'tags' ? (
                  <Check className="w-3 h-3 text-emerald-600" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
                <span>{copiedField === 'tags' ? 'Copied' : 'Copy Tags'}</span>
              </button>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {pin.tags.map((tag, tIdx) => (
                <span
                  key={tIdx}
                  onClick={() => copyToClipboard(tag, `tag-${tIdx}`)}
                  className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-stone-100 hover:bg-rose-50 text-stone-700 hover:text-rose-700 border border-stone-200/80 cursor-pointer transition-colors"
                  title="Click to copy this tag"
                >
                  {copiedField === `tag-${tIdx}` ? '✓ Copied' : tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : (
          <div className="p-4 text-center text-xs text-stone-400 bg-stone-50/50 flex-1 flex flex-col items-center justify-center min-h-[90px]">
            <span className="font-medium text-stone-500">SEO details pending</span>
            <span className="text-[10px] text-stone-400 mt-0.5">
              Title, SEO description, board, alt text & tags will appear here
            </span>
          </div>
        )
      )}
    </div>
  );
};
