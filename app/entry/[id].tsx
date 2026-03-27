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
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius } from '@/src/constants/theme';
import { AudioPlayer } from '@/src/components/AudioPlayer';
import { TopicTag } from '@/src/components/TopicTag';
import { HighlightCard } from '@/src/components/HighlightCard';
import { YouTubePlayerComponent, type YouTubePlayerHandle } from '@/src/components/YouTubePlayer';
import { extractYouTubeVideoId } from '@/src/services/thumbnail';
import { getEntryById } from '@/src/db/entries';
import type { Entry, TimestampedHighlight } from '@/src/types';

function formatSeconds(sec: number): string {
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeHighlightIndex, setActiveHighlightIndex] = useState<number | null>(null);
  const playerRef = useRef<YouTubePlayerHandle>(null);

  // Supercut state
  const [supercutMode, setSupercutMode] = useState(false);
  const [supercutHighlightIndex, setSupercutHighlightIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    getEntryById(id)
      .then(setEntry)
      .finally(() => setLoading(false));
  }, [id]);

  const handlePlayerReady = useCallback(async () => {
    const dur = await playerRef.current?.getDuration();
    if (dur && dur > 0) setVideoDuration(dur);
  }, []);

  const handleHighlightPress = useCallback((highlight: TimestampedHighlight, index: number) => {
    setActiveHighlightIndex(index);
    if (supercutMode) setSupercutHighlightIndex(index);
    playerRef.current?.seekTo(highlight.timestamp);
  }, [supercutMode]);

  const toggleSupercut = useCallback(() => {
    setSupercutMode((prev) => {
      if (!prev) {
        setSupercutHighlightIndex(0);
        setCurrentTime(0);
      }
      return !prev;
    });
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

  // Supercut derived values
  const totalHighlightDuration = highlights.reduce(
    (sum, h) => sum + (h.endTimestamp - h.timestamp), 0
  );
  const timeSaved = videoDuration && videoDuration > totalHighlightDuration
    ? videoDuration - totalHighlightDuration
    : null;
  const savingsPercent = videoDuration && videoDuration > 0
    ? Math.round((1 - totalHighlightDuration / videoDuration) * 100)
    : null;

  // Supercut progress calculation
  const completedTime = highlights
    .slice(0, supercutHighlightIndex)
    .reduce((sum, h) => sum + (h.endTimestamp - h.timestamp), 0);
  const currentSegment = highlights[supercutHighlightIndex];
  const currentSegmentElapsed = currentSegment
    ? Math.max(0, Math.min(currentTime - currentSegment.timestamp, currentSegment.endTimestamp - currentSegment.timestamp))
    : 0;
  const supercutElapsed = completedTime + currentSegmentElapsed;
  const supercutProgress = totalHighlightDuration > 0 ? supercutElapsed / totalHighlightDuration : 0;

  const effectiveActiveIndex = supercutMode ? supercutHighlightIndex : activeHighlightIndex;
  const canSupercut = highlights.length > 1;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        {entry.topic_tag && (
          <View style={styles.tagRow}>
            <TopicTag tag={entry.topic_tag} />
          </View>
        )}
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

      {/* YouTube: Embedded player */}
      {isYouTube && videoId && (
        <YouTubePlayerComponent
          ref={playerRef}
          videoId={videoId}
          supercutMode={supercutMode}
          highlights={highlights}
          onHighlightChange={setSupercutHighlightIndex}
          onCurrentTimeChange={setCurrentTime}
          onSupercutComplete={() => setSupercutMode(false)}
          onReady={handlePlayerReady}
        />
      )}

      {/* YouTube: Highlights section */}
      {isYouTube && highlights.length > 0 && (
        <View style={styles.section}>
          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>
            Key Highlights ({highlights.length})
          </Text>

          {/* Supercut toggle */}
          {canSupercut && (
            <Pressable
              onPress={toggleSupercut}
              style={[styles.supercutToggle, supercutMode && styles.supercutToggleActive]}
            >
              <View style={styles.supercutLeft}>
                <Ionicons
                  name={supercutMode ? 'pause-circle' : 'play-circle'}
                  size={22}
                  color={supercutMode ? colors.text : colors.accentLight}
                />
                <View>
                  <Text style={[styles.supercutLabel, supercutMode && styles.supercutLabelActive]}>
                    Supercut
                  </Text>
                  <Text style={styles.supercutSubtitle}>
                    {supercutMode ? 'Playing condensed version' : 'Skip the filler, just insights'}
                  </Text>
                </View>
              </View>
              {timeSaved !== null && savingsPercent !== null && savingsPercent > 0 && (
                <View style={[styles.savingsBadge, supercutMode && styles.savingsBadgeActive]}>
                  <Text style={[styles.savingsText, supercutMode && styles.savingsTextActive]}>
                    Saves {formatSeconds(timeSaved)} · {savingsPercent}%
                  </Text>
                </View>
              )}
            </Pressable>
          )}

          {/* Supercut progress bar */}
          {supercutMode && (
            <View style={styles.supercutProgress}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.min(supercutProgress * 100, 100)}%` }]} />
              </View>
              <View style={styles.progressMeta}>
                <Text style={styles.segmentInfo}>
                  Segment {supercutHighlightIndex + 1} of {highlights.length}
                </Text>
                <Text style={styles.segmentInfo}>
                  {formatSeconds(supercutElapsed)} / {formatSeconds(totalHighlightDuration)}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.highlightsList}>
            {highlights.map((highlight, index) => (
              <HighlightCard
                key={index}
                highlight={highlight}
                index={index}
                isActive={effectiveActiveIndex === index}
                onPress={() => handleHighlightPress(highlight, index)}
              />
            ))}
          </View>
        </View>
      )}

      {/* TikTok/Instagram: Key Learnings */}
      {!isYouTube && keyLearnings.length > 0 && (
        <View style={styles.section}>
          <View style={styles.divider} />
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
          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>Your Voice Note</Text>
          <AudioPlayer uri={entry.voice_note_path} />
        </View>
      )}

      {/* Voice Note Transcript */}
      {entry.voice_note_transcript && (
        <View style={styles.section}>
          <View style={styles.divider} />
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
          <View style={styles.divider} />
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
    paddingBottom: 80,
    gap: spacing.xl,
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
    gap: spacing.sm,
  },
  tagRow: {
    flexDirection: 'row',
  },
  date: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  platform: {
    color: colors.textMuted,
    fontSize: 12,
  },
  divider: {
    height: 1,
    backgroundColor: colors.cardBorder,
    marginBottom: spacing.xs,
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
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  // Supercut toggle
  supercutToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginTop: spacing.xs,
  },
  supercutToggleActive: {
    backgroundColor: colors.cardElevated,
    borderColor: colors.accent,
  },
  supercutLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  supercutLabel: {
    color: colors.accentLight,
    fontSize: 15,
    fontWeight: '700',
  },
  supercutLabelActive: {
    color: colors.text,
  },
  supercutSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  savingsBadge: {
    backgroundColor: colors.accentGlow,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.3)',
    marginLeft: spacing.sm,
  },
  savingsBadgeActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  savingsText: {
    color: colors.accentLight,
    fontSize: 11,
    fontWeight: '700',
  },
  savingsTextActive: {
    color: colors.text,
  },
  // Supercut progress
  supercutProgress: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  progressTrack: {
    height: 6,
    backgroundColor: colors.cardBorder,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  segmentInfo: {
    color: colors.textMuted,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  // Highlights
  highlightsList: {
    gap: spacing.sm + 4,
  },
  // Learnings
  learningsCard: {
    backgroundColor: colors.cardElevated,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: spacing.md,
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
