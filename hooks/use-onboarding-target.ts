import { useRef, useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { useOnboardingRegistry } from '@/providers/onboarding-provider';

export interface TargetMeasurement {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TargetEntry {
  ref: React.RefObject<View | null>;
  measure: () => Promise<TargetMeasurement>;
}

export function useOnboardingTarget(targetId: string) {
  const ref = useRef<View>(null);
  const { register, unregister } = useOnboardingRegistry();

  const measure = useCallback((): Promise<TargetMeasurement> => {
    return new Promise((resolve, reject) => {
      if (!ref.current) {
        reject(new Error(`Target "${targetId}" ref is null`));
        return;
      }
      ref.current.measureInWindow((x, y, width, height) => {
        if (width === 0 && height === 0) {
          reject(new Error(`Target "${targetId}" has zero dimensions`));
          return;
        }
        resolve({ x, y, width, height });
      });
    });
  }, [targetId]);

  useEffect(() => {
    register(targetId, { ref, measure });
    return () => unregister(targetId);
  }, [targetId, register, unregister, measure]);

  return ref;
}
