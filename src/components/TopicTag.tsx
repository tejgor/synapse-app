import React from 'react';
import { Text, StyleSheet, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { colors, borderRadius } from '../constants/theme';
import { usePressAnimation } from '../utils/animations';

interface TopicTagProps {
  tag: string;
  onPress?: () => void;
  active?: boolean;
}

const AnimatedTouchable = Animated.createAnimatedComponent(Pressable);

export function TopicTag({ tag, onPress, active }: TopicTagProps) {
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation(0.93);

  return (
    <AnimatedTouchable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[styles.container, active && styles.active, animatedStyle]}
    >
      <Text style={[styles.text, active && styles.activeText]}>{tag}</Text>
    </AnimatedTouchable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.accentSubtle,
    borderRadius: borderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  active: {
    backgroundColor: colors.accent,
  },
  text: {
    color: colors.accentMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  activeText: {
    color: colors.text,
  },
});
