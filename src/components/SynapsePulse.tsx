import React, { useEffect } from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { colors } from '../constants/theme';

interface SynapsePulseProps {
  children: React.ReactNode;
  intensity?: 'subtle' | 'medium' | 'strong';
  active?: boolean;
  radius?: number;
  style?: ViewStyle;
}

const INTENSITY_MAP = {
  subtle: { min: 0.03, max: 0.08, spread: 3 },
  medium: { min: 0.05, max: 0.12, spread: 5 },
  strong: { min: 0.07, max: 0.18, spread: 7 },
};

export function SynapsePulse({
  children,
  intensity = 'subtle',
  active = true,
  radius = 20,
  style,
}: SynapsePulseProps) {
  const { min, max, spread } = INTENSITY_MAP[intensity];
  const pulseOpacity = useSharedValue(min);
  const pressGlow = useSharedValue(0);

  useEffect(() => {
    if (active) {
      pulseOpacity.value = withRepeat(
        withTiming(max, { duration: 3000, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      );
    } else {
      pulseOpacity.value = withTiming(0, { duration: 300 });
    }
  }, [active]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value + pressGlow.value,
    transform: [{ scale: 1 + pressGlow.value * 0.3 }],
  }));

  return (
    <Animated.View style={[{ position: 'relative' }, style]}>
      <Animated.View
        style={[
          styles.glow,
          {
            borderRadius: radius + spread,
            top: -spread,
            left: -spread,
            right: -spread,
            bottom: -spread,
          },
          glowStyle,
        ]}
      />
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    backgroundColor: colors.accent,
  },
});
