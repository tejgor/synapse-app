import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { colors, borderRadius, spacing } from '../constants/theme';

interface TagPillProps {
  tag: string;
  onPress?: () => void;
}

export function TagPill({ tag, onPress }: TagPillProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.container, pressed && { opacity: 0.7 }]}
    >
      <Text style={styles.text}>{tag}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  text: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
});
