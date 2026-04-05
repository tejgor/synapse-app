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
}

/**
 * "Crystallization" entrance — elements coalesce from scattered to locked.
 * Combines opacity, translateX/Y jitter, and optional letter-spacing.
 */
export function useCrystallize({ delay = 0, seed = 0 }: CrystallizeOptions = {}) {
  // Deterministic jitter from seed
  const jitterX = ((seed * 2654435761) % 16) - 8; // -8 to +7
  const jitterY = ((seed * 2246822519) % 8) - 4;  // -4 to +3

  const opacity = useSharedValue(0);
  const translateX = useSharedValue(jitterX);
  const translateY = useSharedValue(jitterY);

  useEffect(() => {
    const spring = { damping: 14, stiffness: 140, mass: 1 };
    const timingOpts = { duration: 350, easing: Easing.out(Easing.cubic) };

    opacity.value = withDelay(delay, withTiming(1, timingOpts));
    translateX.value = withDelay(delay, withSpring(0, spring));
    translateY.value = withDelay(delay, withSpring(0, spring));
  }, [delay]);

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
 */
export function useCrystallizeStaggered(index: number) {
  return useCrystallize({
    delay: Math.min(index * 55, 400),
    seed: index + 1,
  });
}
