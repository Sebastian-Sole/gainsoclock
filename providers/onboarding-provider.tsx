import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useConvexAuth } from 'convex/react';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { OnboardingOverlay } from '@/components/onboarding/onboarding-overlay';
import type { TargetEntry } from '@/hooks/use-onboarding-target';

type RegistryListener = () => void;

interface OnboardingRegistryContextValue {
  register: (id: string, entry: TargetEntry) => void;
  unregister: (id: string) => void;
  getTarget: (id: string) => TargetEntry | undefined;
  subscribe: (listener: RegistryListener) => () => void;
}

const OnboardingRegistryContext = createContext<OnboardingRegistryContextValue>({
  register: () => {},
  unregister: () => {},
  getTarget: () => undefined,
  subscribe: () => () => {},
});

export function useOnboardingRegistry() {
  return useContext(OnboardingRegistryContext);
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const registryRef = useRef<Map<string, TargetEntry>>(new Map());
  const listenersRef = useRef<Set<RegistryListener>>(new Set());

  const notify = useCallback(() => {
    for (const listener of listenersRef.current) {
      listener();
    }
  }, []);

  const register = useCallback((id: string, entry: TargetEntry) => {
    registryRef.current.set(id, entry);
    notify();
  }, [notify]);

  const unregister = useCallback((id: string) => {
    registryRef.current.delete(id);
  }, []);

  const getTarget = useCallback((id: string) => {
    return registryRef.current.get(id);
  }, []);

  const subscribe = useCallback((listener: RegistryListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const isActive = useOnboardingStore((s) => s.isActive);

  return (
    <OnboardingRegistryContext.Provider value={{ register, unregister, getTarget, subscribe }}>
      {children}
      <OnboardingTrigger getTarget={getTarget} subscribe={subscribe} />
      {isActive && <OnboardingOverlay getTarget={getTarget} />}
    </OnboardingRegistryContext.Provider>
  );
}

function OnboardingTrigger({
  getTarget,
  subscribe,
}: {
  getTarget: (id: string) => TargetEntry | undefined;
  subscribe: (listener: RegistryListener) => () => void;
}) {
  const { isAuthenticated } = useConvexAuth();
  const hasCompleted = useOnboardingStore((s) => s.hasCompletedOnboarding);
  const isActive = useOnboardingStore((s) => s.isActive);
  const startOnboarding = useOnboardingStore((s) => s.startOnboarding);

  // Track whether the first spotlight target has been registered
  const [targetsReady, setTargetsReady] = useState(() => !!getTarget('tab-workouts'));

  useEffect(() => {
    if (targetsReady) return;

    // Check immediately in case it was registered before this effect ran
    if (getTarget('tab-workouts')) {
      setTargetsReady(true);
      return;
    }

    // Otherwise listen for registry changes
    return subscribe(() => {
      if (getTarget('tab-workouts')) {
        setTargetsReady(true);
      }
    });
  }, [targetsReady, getTarget, subscribe]);

  useEffect(() => {
    if (isAuthenticated && !hasCompleted && !isActive && targetsReady) {
      startOnboarding();
    }
  }, [isAuthenticated, hasCompleted, isActive, targetsReady, startOnboarding]);

  return null;
}
