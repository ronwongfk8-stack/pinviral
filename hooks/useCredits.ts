// hooks/useCredits.ts
import { useState, useCallback } from 'react';
import { CREATION_COSTS, GateTriggerType } from '@/types/billing';

interface UseCreditsReturn {
  credits: number;
  setCredits: (credits: number) => void;
  canCreateImage: boolean;
  canCreateVideo: boolean;
  canExtendVideo: boolean;
  checkCredits: (cost: number) => boolean;
  getMissingCredits: (cost: number) => number;
  getGateType: (action: 'image' | 'video' | 'extension') => GateTriggerType | null;
  deductCredits: (amount: number) => void;
  addCredits: (amount: number) => void;
}

export function useCredits(initialCredits: number = 23): UseCreditsReturn {
  const [credits, setCredits] = useState(initialCredits);

  const checkCredits = useCallback((cost: number): boolean => {
    return credits >= cost;
  }, [credits]);

  const getMissingCredits = useCallback((cost: number): number => {
    return Math.max(0, cost - credits);
  }, [credits]);

  const canCreateImage = credits >= CREATION_COSTS.IMAGE;
  const canCreateVideo = credits >= CREATION_COSTS.VIDEO;
  const canExtendVideo = credits >= CREATION_COSTS.EXTENSION;

  const getGateType = useCallback((action: 'image' | 'video' | 'extension'): GateTriggerType | null => {
    const cost = CREATION_COSTS[action.toUpperCase() as keyof typeof CREATION_COSTS];
    if (credits >= cost) return null;

    if (credits === 0) return action === 'image' ? 'image' : action === 'video' ? 'video' : 'extension';
    return action === 'image' ? 'image' : action === 'video' ? 'video' : 'extension';
  }, [credits]);

  const deductCredits = useCallback((amount: number) => {
    setCredits(prev => Math.max(0, prev - amount));
  }, []);

  const addCredits = useCallback((amount: number) => {
    setCredits(prev => prev + amount);
  }, []);

  return {
    credits,
    setCredits,
    canCreateImage,
    canCreateVideo,
    canExtendVideo,
    checkCredits,
    getMissingCredits,
    getGateType,
    deductCredits,
    addCredits
  };
}