import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { colors, borderRadius, spacing } from '../constants/theme';

interface TopicTagProps {
  tag: string;
  onPress?: () => void;
  active?: boolean;
}

export function TopicTag({ tag, onPress, active }: TopicTagProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.container, active && styles.active]}
    >
      <Text style={[styles.text, active && styles.activeText]}>{tag}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.accentGlow,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.3)',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  active: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  text: {
    color: colors.accentLight,
    fontSize: 13,
    fontWeight: '600',
  },
  activeText: {
    color: colors.text,
  },
});
