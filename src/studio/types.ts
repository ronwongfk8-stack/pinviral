export type AspectRatio = '9:16' | '2:3' | '1:1';

export type EnvironmentStyle =
  | 'cafe_view'
  | 'lake_view'
  | 'city_mobile_view'
  | 'cozy_nook_view'
  | 'luxury_terrace_view'
  | 'scandinavian'
  | 'boho'
  | 'luxury_marble'
  | 'outdoor_botanical'
  | 'minimalist_pastel';

export type OverlayStyle =
  | 'card'
  | 'bottom-gradient'
  | 'minimal-pill'
  | 'banner'
  | 'clean-text'
  | 'editorial';

export type FontFamily =
  | 'Plus Jakarta Sans'
  | 'Playfair Display'
  | 'Inter'
  | 'Caveat'
  | 'Cinzel'
  | 'Oswald';

export interface TextOverlaySettings {
  headline: string;
  subtitle: string;
  badgeText: string;
  ctaText: string;
  textColor: string;
  badgeColor: string;
  overlayBgColor: string;
  overlayBgOpacity: number; // 0 to 1
  fontSize: number; // in px
  positionX: number; // -50 to +50 percent
  positionY: number; // -50 to +50 percent
  rotation: number; // -45 to +45 deg
  overlayStyle: OverlayStyle;
  fontFamily: FontFamily;
  showBadge: boolean;
  showCta: boolean;
  showShadow: boolean;
  textAlign: 'left' | 'center' | 'right';
}

export interface SocialProofData {
  url: string;
  brandOrProductName: string;
  rating: number;
  reviewCount: string;
  topQuotes: string[];
  trustBadges: string[];
  summary: string;
  targetKeywords: string[];
}

export interface PinItem {
  id: string;
  environmentName: string;
  environmentStyle: EnvironmentStyle;
  environmentColorTheme: {
    backgroundPrimary: string;
    backgroundSecondary: string;
    accentColor: string;
    textDefaultColor: string;
    overlayBg: string;
  };
  title: string;
  seoDescription: string;
  board: string;
  altText: string;
  tags: string[];
  overlay: TextOverlaySettings;
  visualPrompt: string;
  generatedImageUrl?: string;
  imageStatus?: 'idle' | 'loading' | 'done' | 'error' | 'nocredit';
  imageError?: string;
  backgroundImageUrl?: string;
}

export interface SampleProduct {
  id: string;
  name: string;
  category: string;
  url: string;
  imageUrl: string;
  socialProof: Partial<SocialProofData>;
}

export interface ScenePreset {
  id: string;
  name: string;
  style: EnvironmentStyle;
  imageUrl: string;
  tagline: string;
}

