import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';

interface CrystallizeOptions {
  delay?: number;
  /** Seed for deterministic jitter (use item index) */
  seed?: number;
  /** Skip scatter effect — just fade in quickly (used during search) */
  skip?: boolean;
}

/**
 * "Crystallization" entrance — elements coalesce from scattered to locked.
 * Combines opacity, translateX/Y jitter, and optional letter-spacing.
 * When `skip` is true, plays a quick uniform fade with no scatter or stagger.
 */
export function useCrystallize({ delay = 0, seed = 0, skip = false }: CrystallizeOptions = {}) {
  // Deterministic jitter from seed (ignored when skip=true)
  const jitterX = skip ? 0 : ((seed * 2654435761) % 16) - 8;
  const jitterY = skip ? 0 : ((seed * 2246822519) % 8) - 4;

  const opacity = useSharedValue(0);
  const translateX = useSharedValue(jitterX);
  const translateY = useSharedValue(skip ? 6 : jitterY);

  useEffect(() => {
    if (skip) {
      // Clean fade + subtle slide up — no scatter
      const timingOpts = { duration: 280, easing: Easing.out(Easing.cubic) };
      opacity.value = withDelay(delay, withTiming(1, timingOpts));
      translateY.value = withDelay(delay, withTiming(0, timingOpts));
      return;
    }
    const spring = { damping: 14, stiffness: 140, mass: 1 };
    const timingOpts = { duration: 350, easing: Easing.out(Easing.cubic) };
    opacity.value = withDelay(delay, withTiming(1, timingOpts));
    translateX.value = withDelay(delay, withSpring(0, spring));
    translateY.value = withDelay(delay, withSpring(0, spring));
  }, [delay, skip]);

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));
}

/**
 * For list items — crystalize with index-based stagger (capped at 400ms).
 * Pass skip=true during search for a fast, clean fade instead.
 */
export function useCrystallizeStaggered(index: number, skip = false) {
  return useCrystallize({
    delay: skip ? Math.min(index * 30, 200) : Math.min(index * 55, 400),
    seed: index + 1,
    skip,
  });
}
