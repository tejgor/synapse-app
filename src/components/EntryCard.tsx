import React, { useRef } from 'react';
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import ReAnimated from 'react-native-reanimated';
import {
  colors, borderRadius, spacing, shadows, typography, categoryColor, categoryTint, platformColors,
} from '../constants/theme';
import { usePressAnimation, usePulse } from '../utils/animations';
import { useCrystallizeStaggered } from '../utils/useCrystallize';
import type { Entry } from '../types';

const AnimatedPressable = ReAnimated.createAnimatedComponent(Pressable);

export type CardVariant = 'standard' | 'compact';

interface EntryCardProps {
  entry: Entry;
  onPress: () => void;
  onDelete?: () => void;
  onCategoryPress?: (category: string) => void;
  index?: number;
  variant?: CardVariant;
}

const PLATFORM_ICONS: Record<string, string> = {
  tiktok: 'logo-tiktok',
  instagram: 'logo-instagram',
  youtube: 'logo-youtube',
};

function ProcessingDot() {
  const pulseStyle = usePulse();
  return <ReAnimated.View style={[styles.processingDot, pulseStyle]} />;
}

export function EntryCard({
  entry, onPress, onDelete, onCategoryPress, index = 0, variant = 'standard',
}: EntryCardProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const crystalStyle = useCrystallizeStaggered(index);
  const { animatedStyle: pressStyle, onPressIn, onPressOut } = usePressAnimation(0.975);

  const isProcessing =
    entry.processing_status === 'processing' || entry.processing_status === 'pending';

  const date = new Date(entry.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });

  const catColor = entry.category ? categoryColor(entry.category) : colors.accentMuted;
  const catTint = entry.category ? categoryTint(entry.category) : 'transparent';
  const platformIcon = PLATFORM_ICONS[entry.source_platform] as any;

  const renderRightActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-80, 0], outputRange: [1, 0.8], extrapolate: 'clamp',
    });
    return (
      <Pressable
        style={styles.deleteAction}
        onPress={() => { swipeableRef.current?.close(); onDelete?.(); }}
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          <Ionicons name="trash-outline" size={17} color={colors.text} />
        </Animated.View>
      </Pressable>
    );
  };

  // ── Compact variant ──────────────────────────────────────────────────────
  if (variant === 'compact') {
    return (
      <ReAnimated.View style={[styles.compactWrapper, crystalStyle]}>
        <Swipeable
          ref={swipeableRef}
          renderRightActions={renderRightActions}
          rightThreshold={40}
          overshootRight={false}
        >
          <AnimatedPressable
            onPress={onPress}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            style={[styles.compactCard, { shadowColor: catColor }, pressStyle]}
          >
            <View style={[styles.compactDot, { backgroundColor: catColor }]} />
            <Text style={styles.compactTitle} numberOfLines={1}>
              {entry.title || (isProcessing ? 'Extracting knowledge...' : entry.processing_status === 'failed' ? 'Analysis failed' : 'Untitled')}
            </Text>
            <View style={styles.compactRight}>
              {platformIcon && (
                <Ionicons name={platformIcon} size={10} color={colors.textPlaceholder} style={{ marginRight: 5 }} />
              )}
              <Text style={styles.compactDate}>{date}</Text>
            </View>
          </AnimatedPressable>
        </Swipeable>
      </ReAnimated.View>
    );
  }

  // ── Standard variant ─────────────────────────────────────────────────────
  return (
    <ReAnimated.View style={[styles.standardWrapper, crystalStyle]}>
      <Swipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        rightThreshold={40}
        overshootRight={false}
      >
        <AnimatedPressable
          onPress={onPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          style={[styles.card, { backgroundColor: catTint, shadowColor: catColor }, pressStyle]}
        >
          <View style={styles.cardBody}>
            {/* Category pill */}
            {entry.category && !isProcessing && (
              <View style={[styles.categoryPill, { backgroundColor: `${catColor}22` }]}>
                <View style={[styles.categoryDot, { backgroundColor: catColor }]} />
                <Text style={[styles.categoryLabel, { color: catColor }]}>{entry.category}</Text>
              </View>
            )}
            {isProcessing && (
              <View style={styles.processingRow}>
                <ProcessingDot />
                <Text style={styles.processingLabel}>Processing...</Text>
              </View>
            )}

            {/* Title */}
            {entry.title ? (
              <Text style={styles.title} numberOfLines={2}>{entry.title}</Text>
            ) : entry.processing_status === 'failed' ? (
              <Text style={styles.failedText}>Processing failed — tap to view</Text>
            ) : null}

            {/* Summary */}
            {entry.summary ? (
              <Text style={styles.summary} numberOfLines={2}>{entry.summary}</Text>
            ) : null}

            {/* Footer: platform + date */}
            <View style={styles.footer}>
              {platformIcon && (
                <Ionicons name={platformIcon} size={11} color={colors.textPlaceholder} />
              )}
              <Text style={styles.date}>{date}</Text>
            </View>
          </View>
        </AnimatedPressable>
      </Swipeable>
    </ReAnimated.View>
  );
}

const styles = StyleSheet.create({
  // ── Standard ──────────────────────────────────────────────────────────────
  standardWrapper: {
    marginHorizontal: spacing.md,
    marginBottom: 10,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  cardBody: {
    padding: 18,
    gap: 8,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 5,
  },
  categoryDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  processingLabel: {
    color: colors.textTertiary,
    fontSize: 11,
    fontStyle: 'italic',
  },
  title: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 23,
    letterSpacing: -0.2,
  },
  summary: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  date: {
    ...typography.mono,
    color: colors.textPlaceholder,
  },
  failedText: { color: colors.error, fontSize: 13 },
  processingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  deleteAction: {
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    marginBottom: 10,
    borderRadius: 16,
    marginRight: spacing.md,
  },

  // ── Compact ───────────────────────────────────────────────────────────────
  compactWrapper: {
    marginHorizontal: spacing.md,
    marginBottom: 1,
  },
  compactCard: {
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    paddingVertical: 12,
    paddingRight: 16,
    gap: 12,
  },
  compactDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    flexShrink: 0,
  },
  compactTitle: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  compactRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  compactDate: {
    ...typography.mono,
    color: colors.textPlaceholder,
    fontSize: 10,
  },
});
