import React from 'react';
import { View, Text, Image, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, borderRadius, spacing } from '../constants/theme';
import { TopicTag } from './TopicTag';
import type { Entry, TimestampedHighlight } from '../types';

interface EntryCardProps {
  entry: Entry;
  onPress: () => void;
  onTagPress?: (tag: string) => void;
}

export function EntryCard({ entry, onPress, onTagPress }: EntryCardProps) {
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
  const date = new Date(entry.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <Pressable onPress={onPress} style={styles.card}>
      {entry.thumbnail_url ? (
        <Image source={{ uri: entry.thumbnail_url }} style={styles.thumbnail} />
      ) : (
        <View style={[styles.thumbnail, styles.placeholderThumb]}>
          <Text style={styles.placeholderIcon}>
            {entry.source_platform === 'tiktok' ? '🎵' : entry.source_platform === 'youtube' ? '🎬' : '📸'}
          </Text>
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
    marginBottom: spacing.sm + 4,
  },
  thumbnail: {
    width: 80,
    height: 100,
  },
  placeholderThumb: {
    backgroundColor: colors.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 28,
  },
  content: {
    flex: 1,
    padding: spacing.sm + 4,
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  date: {
    color: colors.textMuted,
    fontSize: 12,
  },
  preview: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
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
});
