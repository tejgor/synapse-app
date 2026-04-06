import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import { colors, borderRadius } from '../constants/theme';
import { usePressAnimation } from '../utils/animations';

interface TopicTagProps {
  tag: string;
  count?: number;
  onPress?: () => void;
  active?: boolean;
}

const AnimatedTouchable = Animated.createAnimatedComponent(Pressable);

export function TopicTag({ tag, count, onPress, active }: TopicTagProps) {
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation(0.93);

  return (
    <AnimatedTouchable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[styles.container, active && styles.active, animatedStyle]}
    >
      <Text style={[styles.text, active && styles.activeText]}>
        {tag}
      </Text>
      {count != null && (
        <View style={[styles.countBadge, active && styles.countBadgeActive]}>
          <Text style={[styles.countText, active && styles.countTextActive]}>{count}</Text>
        </View>
      )}
    </AnimatedTouchable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    backgroundColor: colors.surfaceRaised,
    borderRadius: borderRadius.sm,
    paddingLeft: 12,
    paddingRight: 7,
    gap: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  active: {
    backgroundColor: colors.accentSubtle,
    borderColor: colors.accentMuted,
  },
  text: {
    color: colors.textTertiary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  activeText: {
    color: colors.text,
  },
  countBadge: {
    backgroundColor: colors.surfaceOverlay,
    borderRadius: borderRadius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: 'center',
  },
  countBadgeActive: {
    backgroundColor: 'rgba(180,154,232,0.28)',
  },
  countText: {
    color: colors.textPlaceholder,
    fontSize: 11,
    fontWeight: '600',
  },
  countTextActive: {
    color: colors.accentMuted,
  },
});
