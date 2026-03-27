import React, { useRef } from 'react';
import { View, Text, Image, Pressable, StyleSheet, ActivityIndicator, Animated } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { colors, borderRadius, spacing } from '../constants/theme';
import { TopicTag } from './TopicTag';
import type { Entry, TimestampedHighlight } from '../types';

interface EntryCardProps {
  entry: Entry;
  onPress: () => void;
  onDelete?: () => void;
  onTagPress?: (tag: string) => void;
}

export function EntryCard({ entry, onPress, onDelete, onTagPress }: EntryCardProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const keyLearnings: string[] = entry.key_learnings
    ? JSON.parse(entry.key_learnings)
    : [];
  const highlights: TimestampedHighlight[] = entry.highlights
    ? JSON.parse(entry.highlights)
    : [];
  const isYouTube = entry.source_platform === 'youtube';
  const previewText = isYouTube
    ? (highlights[0]?.title || null)
    : (keyLearnings[0] || null);
  const isProcessing = entry.processing_status === 'processing' || entry.processing_status === 'pending';
  const isDone = entry.processing_status === 'done';
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
        {isDone && <View style={styles.accentBorder} />}

        {entry.thumbnail_url ? (
          <Image source={{ uri: entry.thumbnail_url }} style={styles.thumbnail} />
        ) : (
          <View style={[styles.thumbnail, styles.placeholderThumb]}>
            <Ionicons
              name={entry.source_platform === 'tiktok' ? 'musical-notes' : entry.source_platform === 'youtube' ? 'play-circle' : 'camera'}
              size={28}
              color={colors.textMuted}
            />
          </View>
        )}

        <View style={styles.content}>
          <View style={styles.topRow}>
            {entry.topic_tag ? (
              <TopicTag
                tag={entry.topic_tag}
                onPress={() => onTagPress?.(entry.topic_tag!)}
              />
            ) : isProcessing ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : null}
            <Text style={styles.date}>{date}</Text>
          </View>

          {previewText ? (
            <Text style={styles.preview} numberOfLines={2}>
              {previewText}
            </Text>
          ) : isProcessing ? (
            <Text style={styles.processingText}>Processing...</Text>
          ) : entry.processing_status === 'failed' ? (
            <Text style={styles.failedText}>Processing failed — tap to view</Text>
          ) : null}
        </View>
      </Pressable>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    minHeight: 108,
  },
  accentBorder: {
    width: 3,
    backgroundColor: colors.accent,
  },
  thumbnail: {
    width: 88,
    alignSelf: 'stretch',
  },
  placeholderThumb: {
    backgroundColor: colors.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.sm,
    justifyContent: 'center',
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
  preview: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
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
