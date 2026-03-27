import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius } from '../constants/theme';
import type { TimestampedHighlight } from '../types';

interface HighlightCardProps {
  highlight: TimestampedHighlight;
  index: number;
  isActive?: boolean;
  onPress: () => void;
}

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function HighlightCard({ highlight, index, isActive, onPress }: HighlightCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, isActive && styles.activeCard]}
    >
      <View style={styles.header}>
        <View style={styles.indexBadge}>
          <Text style={styles.indexText}>{index + 1}</Text>
        </View>
        <View style={styles.timeBadge}>
          <Text style={styles.timeText}>
            {formatTimestamp(highlight.timestamp)} – {formatTimestamp(highlight.endTimestamp)}
          </Text>
        </View>
      </View>
      <Text style={styles.title}>{highlight.title}</Text>
      <Text style={styles.summary}>{highlight.summary}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: spacing.md,
  },
  activeCard: {
    borderColor: colors.accent,
    backgroundColor: colors.cardElevated,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  indexBadge: {
    width: 26,
    height: 26,
    borderRadius: borderRadius.full,
    backgroundColor: colors.accentGlow,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  indexText: {
    color: colors.accentLight,
    fontSize: 12,
    fontWeight: '700',
  },
  timeBadge: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  timeText: {
    color: colors.accentLight,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  summary: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
});
