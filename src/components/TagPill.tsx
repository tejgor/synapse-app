import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { colors, borderRadius } from '../constants/theme';

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
    backgroundColor: colors.accentSubtle,
    borderRadius: borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  text: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: '500',
  },
});
