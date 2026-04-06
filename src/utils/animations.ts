import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { animation } from '../constants/theme';

/**
 * Staggered fade-in + slide-up entrance for list cards.
 */
export function useCardEntrance(index: number) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(16);

  useEffect(() => {
    const delay = Math.min(index * 60, 360);
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: 350, easing: Easing.out(Easing.cubic) })
    );
    translateY.value = withDelay(
      delay,
      withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) })
    );
  }, []);

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));
}

/**
 * Scale + opacity spring animation for pressable elements.
 */
export function usePressAnimation(scaleTarget = 0.975) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const onPressIn = () => {
    scale.value = withSpring(scaleTarget, animation.spring.snappy);
    opacity.value = withTiming(0.8, { duration: animation.duration.instant });
  };

  const onPressOut = () => {
    scale.value = withSpring(1, animation.spring.snappy);
    opacity.value = withTiming(1, { duration: animation.duration.fast });
  };

  return { animatedStyle, onPressIn, onPressOut };
}

/**
 * Looping opacity pulse — for processing/loading indicators.
 */
export function usePulse() {
  const opacity = useSharedValue(1);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1
    );
  }, []);

  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

/**
 * Staggered entrance for empty state elements.
 */
export function useEmptyStateEntrance(order: number) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(order === 0 ? 0 : 8);
  const scale = useSharedValue(order === 0 ? 0.85 : 1);

  useEffect(() => {
    const delay = order * 100;
    if (order === 0) {
      opacity.value = withDelay(delay, withTiming(1, { duration: animation.duration.slow }));
      scale.value = withDelay(delay, withSpring(1, animation.spring.gentle));
    } else {
      opacity.value = withDelay(delay, withTiming(1, { duration: animation.duration.normal }));
      translateY.value = withDelay(
        delay,
        withTiming(0, { duration: animation.duration.normal, easing: Easing.out(Easing.cubic) })
      );
    }
  }, []);

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));
}

/**
 * Slide-in from bottom for command bar and sheets.
 */
export function useSlideUp(delay = 0) {
  const translateY = useSharedValue(60);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withSpring(0, { damping: 22, stiffness: 180, mass: 1 })
    );
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: 200 })
    );
  }, []);

  return useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));
}

/**
 * Expanding height reveal for detection strips and action rows.
 * Pass a boolean and target height.
 */
export function useHeightReveal(visible: boolean, targetHeight: number) {
  const height = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    height.value = withSpring(visible ? targetHeight : 0, {
      damping: 18,
      stiffness: 160,
      mass: 1,
    });
    opacity.value = withTiming(visible ? 1 : 0, { duration: 200 });
  }, [visible]);

  return useAnimatedStyle(() => ({
    height: height.value,
    opacity: opacity.value,
    overflow: 'hidden',
  }));
}

/**
 * Collapse + fade for the command bar save animation.
 * Call trigger() to start, then onDone is called at end.
 */
export function useCollapseAnimation() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const trigger = (onDone: () => void) => {
    scale.value = withSequence(
      withTiming(0.94, { duration: 120, easing: Easing.in(Easing.cubic) }),
      withTiming(0.85, { duration: 200, easing: Easing.in(Easing.cubic) })
    );
    opacity.value = withTiming(0, { duration: 320 }, (finished) => {
      if (finished) {
        // runOnJS is handled outside — caller uses setTimeout
      }
    });
    setTimeout(onDone, 350);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return { trigger, animatedStyle };
}
