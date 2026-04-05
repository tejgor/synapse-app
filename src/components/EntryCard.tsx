import React, { useRef } from 'react';
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import ReAnimated from 'react-native-reanimated';
import { colors, borderRadius, spacing, shadows, typography } from '../constants/theme';
import { TopicTag } from './TopicTag';
import { useCardEntrance, usePressAnimation, usePulse } from '../utils/animations';
import type { Entry } from '../types';

const AnimatedPressable = ReAnimated.createAnimatedComponent(Pressable);

interface EntryCardProps {
  entry: Entry;
  onPress: () => void;
  onDelete?: () => void;
  onCategoryPress?: (category: string) => void;
  index?: number;
}

function ProcessingDot() {
  const pulseStyle = usePulse();
  return (
    <ReAnimated.View style={[styles.processingDot, pulseStyle]} />
  );
}

export function EntryCard({ entry, onPress, onDelete, onCategoryPress, index = 0 }: EntryCardProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const entranceStyle = useCardEntrance(index);
  const { animatedStyle: pressStyle, onPressIn, onPressOut } = usePressAnimation(0.975);

  const tags: string[] = entry.tags ? JSON.parse(entry.tags) : [];
  const visibleTags = tags.slice(0, 3);
  const extraTagCount = tags.length - visibleTags.length;

  const isProcessing = entry.processing_status === 'processing' || entry.processing_status === 'pending';

  const date = new Date(entry.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  const renderRightActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [1, 0.8],
      extrapolate: 'clamp',
    });

    return (
      <AnimatedPressable
        style={styles.deleteAction}
        onPress={() => {
          swipeableRef.current?.close();
          onDelete?.();
        }}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          <Ionicons name="trash-outline" size={20} color={colors.text} />
        </Animated.View>
      </AnimatedPressable>
    );
  };

  return (
    <ReAnimated.View style={entranceStyle}>
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
          style={[styles.card, pressStyle]}
        >
          {/* Top row: category badge + date */}
          <View style={styles.topRow}>
            {entry.category ? (
              <TopicTag
                tag={entry.category}
                onPress={() => onCategoryPress?.(entry.category!)}
              />
            ) : isProcessing ? (
              <ProcessingDot />
            ) : (
              <View />
            )}
            <Text style={styles.date}>{date}</Text>
          </View>

          {/* Title */}
          {entry.title ? (
            <Text style={styles.title} numberOfLines={2}>{entry.title}</Text>
          ) : isProcessing ? (
            <Text style={styles.processingText}>Extracting knowledge...</Text>
          ) : entry.processing_status === 'failed' ? (
            <Text style={styles.failedText}>Processing failed — tap to view</Text>
          ) : null}

          {/* Summary snippet */}
          {entry.summary ? (
            <Text style={styles.summary} numberOfLines={2}>{entry.summary}</Text>
          ) : null}

          {/* Tags row */}
          {visibleTags.length > 0 && (
            <View style={styles.tagsRow}>
              {visibleTags.map((tag) => (
                <View key={tag} style={styles.tagPill}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
              {extraTagCount > 0 && (
                <View style={styles.tagPill}>
                  <Text style={styles.tagText}>+{extraTagCount}</Text>
                </View>
              )}
            </View>
          )}
        </AnimatedPressable>
      </Swipeable>
    </ReAnimated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.lg,
    marginBottom: 20,
    padding: 18,
    gap: 10,
    ...shadows.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  date: {
    color: colors.textTertiary,
    ...typography.caption,
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
    letterSpacing: -0.1,
  },
  summary: {
    color: colors.textSecondary,
    ...typography.caption,
    lineHeight: 19,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  tagPill: {
    backgroundColor: colors.accentSubtle,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  tagText: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: '500',
  },
  processingText: {
    color: colors.textTertiary,
    fontSize: 13,
    fontStyle: 'italic',
  },
  failedText: {
    color: colors.error,
    fontSize: 13,
  },
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
    width: 76,
    marginBottom: 20,
    borderRadius: borderRadius.lg,
    marginRight: spacing.lg,
  },
});
