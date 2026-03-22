import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { colors, spacing, borderRadius } from '@/src/constants/theme';
import { AudioPlayer } from '@/src/components/AudioPlayer';
import { TopicTag } from '@/src/components/TopicTag';
import { HighlightCard } from '@/src/components/HighlightCard';
import { YouTubePlayerComponent, type YouTubePlayerHandle } from '@/src/components/YouTubePlayer';
import { extractYouTubeVideoId } from '@/src/services/thumbnail';
import { getEntryById } from '@/src/db/entries';
import type { Entry, TimestampedHighlight } from '@/src/types';

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeHighlightIndex, setActiveHighlightIndex] = useState<number | null>(null);
  const playerRef = useRef<YouTubePlayerHandle>(null);

  useEffect(() => {
    if (!id) return;
    getEntryById(id)
      .then(setEntry)
      .finally(() => setLoading(false));
  }, [id]);

  const handleHighlightPress = useCallback((highlight: TimestampedHighlight, index: number) => {
    setActiveHighlightIndex(index);
    playerRef.current?.seekTo(highlight.timestamp);
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!entry) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Entry not found</Text>
      </View>
    );
  }

  const keyLearnings: string[] = entry.key_learnings
    ? JSON.parse(entry.key_learnings)
    : [];
  const highlights: TimestampedHighlight[] = entry.highlights
    ? JSON.parse(entry.highlights)
    : [];
  const isProcessing =
    entry.processing_status === 'processing' || entry.processing_status === 'pending';
  const isYouTube = entry.source_platform === 'youtube';
  const videoId = isYouTube ? extractYouTubeVideoId(entry.video_url) : null;
  const date = new Date(entry.created_at).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const platformLabel =
    entry.source_platform === 'tiktok'
      ? 'TikTok'
      : entry.source_platform === 'instagram'
        ? 'Instagram Reels'
        : 'YouTube';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        {entry.topic_tag && <TopicTag tag={entry.topic_tag} />}
        <Text style={styles.date}>{date}</Text>
        <Text style={styles.platform}>{platformLabel}</Text>
      </View>

      {/* Processing banner */}
      {isProcessing && (
        <View style={styles.processingBanner}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.processingText}>
            {isYouTube ? 'Extracting highlights...' : 'Processing your capture...'}
          </Text>
        </View>
      )}

      {entry.processing_status === 'failed' && (
        <View style={[styles.processingBanner, styles.failedBanner]}>
          <Text style={styles.failedText}>
            {isYouTube
              ? 'Failed to extract highlights. Try again later.'
              : 'Processing failed. Your voice note is still saved.'}
          </Text>
        </View>
      )}

      {/* YouTube: Embedded player + Highlights */}
      {isYouTube && videoId && (
        <YouTubePlayerComponent ref={playerRef} videoId={videoId} />
      )}

      {isYouTube && highlights.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Key Highlights ({highlights.length})
          </Text>
          <View style={styles.highlightsList}>
            {highlights.map((highlight, index) => (
              <HighlightCard
                key={index}
                highlight={highlight}
                index={index}
                isActive={activeHighlightIndex === index}
                onPress={() => handleHighlightPress(highlight, index)}
              />
            ))}
          </View>
        </View>
      )}

      {/* TikTok/Instagram: Key Learnings */}
      {!isYouTube && keyLearnings.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Key Learnings</Text>
          <View style={styles.learningsCard}>
            {keyLearnings.map((learning, index) => (
              <View key={index} style={styles.learningRow}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.learningText}>{learning}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Voice Note */}
      {entry.voice_note_path && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Voice Note</Text>
          <AudioPlayer uri={entry.voice_note_path} />
        </View>
      )}

      {/* Voice Note Transcript */}
      {entry.voice_note_transcript && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What You Said</Text>
          <View style={styles.transcriptCard}>
            <Text style={styles.transcriptText}>
              "{entry.voice_note_transcript}"
            </Text>
          </View>
        </View>
      )}

      {/* Video Transcript */}
      {entry.video_transcript && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Video Transcript</Text>
          <View style={styles.transcriptCard}>
            <Text style={styles.transcriptText}>{entry.video_transcript}</Text>
          </View>
        </View>
      )}

      {/* Open Original */}
      <Pressable
        style={styles.openButton}
        onPress={() => Linking.openURL(entry.video_url)}
      >
        <Text style={styles.openButtonText}>
          Open in {platformLabel}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 60,
    gap: spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: colors.textMuted,
    fontSize: 16,
  },
  header: {
    gap: spacing.xs,
  },
  date: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: spacing.xs,
  },
  platform: {
    color: colors.textMuted,
    fontSize: 12,
  },
  processingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  failedBanner: {
    borderColor: colors.error,
  },
  processingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  failedText: {
    color: colors.error,
    fontSize: 14,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  highlightsList: {
    gap: spacing.sm + 4,
  },
  learningsCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.sm + 4,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  learningRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  bullet: {
    color: colors.accent,
    fontSize: 16,
    lineHeight: 22,
  },
  learningText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
    flex: 1,
  },
  transcriptCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  transcriptText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    fontStyle: 'italic',
  },
  openButton: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  openButtonText: {
    color: colors.accentLight,
    fontSize: 15,
    fontWeight: '600',
  },
});
