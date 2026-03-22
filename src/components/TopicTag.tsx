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
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs,
  },
  active: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  text: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  activeText: {
    color: colors.text,
  },
});
