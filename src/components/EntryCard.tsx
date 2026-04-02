import React, { useRef } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Animated } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { colors, borderRadius, spacing } from '../constants/theme';
import { TopicTag } from './TopicTag';
import type { Entry } from '../types';

interface EntryCardProps {
  entry: Entry;
  onPress: () => void;
  onDelete?: () => void;
  onCategoryPress?: (category: string) => void;
}

export function EntryCard({ entry, onPress, onDelete, onCategoryPress }: EntryCardProps) {
  const swipeableRef = useRef<Swipeable>(null);

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
      <Pressable
        style={styles.deleteAction}
        onPress={() => {
          swipeableRef.current?.close();
          onDelete?.();
        }}
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          <Ionicons name="trash-outline" size={22} color={colors.text} />
        </Animated.View>
      </Pressable>
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.75 }]}
      >
        {/* Top row: category badge + date */}
        <View style={styles.topRow}>
          {entry.category ? (
            <TopicTag
              tag={entry.category}
              onPress={() => onCategoryPress?.(entry.category!)}
            />
          ) : isProcessing ? (
            <ActivityIndicator size="small" color={colors.accent} />
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
      </Pressable>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  date: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 21,
  },
  summary: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  tagPill: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  tagText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  processingText: {
    color: colors.textMuted,
    fontSize: 13,
    fontStyle: 'italic',
  },
  failedText: {
    color: colors.error,
    fontSize: 13,
  },
  deleteAction: {
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    marginBottom: spacing.md,
    borderRadius: borderRadius.lg,
    marginRight: spacing.md,
  },
});
