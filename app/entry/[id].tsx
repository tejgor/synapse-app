import React, { useEffect, useState, useCallback } from 'react';
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
import { TopicTag } from '@/src/components/TopicTag';
import { TagPill } from '@/src/components/TagPill';
import { KeyDetailRow } from '@/src/components/KeyDetailRow';
import { getEntryById } from '@/src/db/entries';
import type { Entry, KeyDetail } from '@/src/types';

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram Reels',
  youtube: 'YouTube',
};

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    if (!id) return;
    getEntryById(id)
      .then(setEntry)
      .finally(() => setLoading(false));
  }, [id]);

  const toggleTranscript = useCallback(() => {
    setShowTranscript((v) => !v);
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

  const tags: string[] = entry.tags ? JSON.parse(entry.tags) : [];
  const keyDetails: KeyDetail[] = entry.key_details ? JSON.parse(entry.key_details) : [];

  const isProcessing =
    entry.processing_status === 'processing' || entry.processing_status === 'pending';

  const date = new Date(entry.created_at).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const platformLabel = PLATFORM_LABELS[entry.source_platform] || entry.source_platform;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerMeta}>
          {entry.category && <TopicTag tag={entry.category} />}
          <Text style={styles.date}>{date}</Text>
        </View>
        {entry.title && (
          <Text style={styles.title}>{entry.title}</Text>
        )}
        {entry.summary && (
          <Text style={styles.summary}>{entry.summary}</Text>
        )}
        {tags.length > 0 && (
          <View style={styles.tagsRow}>
            {tags.map((tag) => (
              <TagPill key={tag} tag={tag} />
            ))}
          </View>
        )}
      </View>

      {/* Processing banner */}
      {isProcessing && (
        <View style={styles.processingBanner}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.processingText}>Extracting knowledge...</Text>
        </View>
      )}

      {entry.processing_status === 'failed' && (
        <View style={[styles.processingBanner, styles.failedBanner]}>
          <Text style={styles.failedText}>Processing failed. Try again later.</Text>
        </View>
      )}

      {/* Key Details */}
      {keyDetails.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Key Details</Text>
          <View style={styles.detailsCard}>
            {keyDetails.map((detail, index) => (
              <React.Fragment key={index}>
                {index > 0 && <View style={styles.detailDivider} />}
                <KeyDetailRow label={detail.label} value={detail.value} />
              </React.Fragment>
            ))}
          </View>
        </View>
      )}

      {/* Transcript (collapsible) */}
      {entry.video_transcript && (
        <View style={styles.section}>
          <Pressable style={styles.transcriptToggle} onPress={toggleTranscript}>
            <Text style={styles.sectionTitle}>Transcript</Text>
            <Ionicons
              name={showTranscript ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.textMuted}
            />
          </Pressable>
          {showTranscript && (
            <View style={styles.transcriptCard}>
              <Text style={styles.transcriptText}>{entry.video_transcript}</Text>
            </View>
          )}
        </View>
      )}

      {/* Source link */}
      <Pressable
        style={styles.sourceButton}
        onPress={() => Linking.openURL(entry.source_url)}
      >
        <Text style={styles.sourceButtonText}>View source</Text>
        <Text style={styles.sourcePlatform}>{platformLabel}</Text>
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
    gap: spacing.md,
  },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  date: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 30,
  },
  summary: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 23,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
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
  detailsCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  detailDivider: {
    height: 1,
    backgroundColor: colors.cardBorder,
    marginVertical: spacing.xs,
  },
  transcriptToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    fontSize: 13,
    lineHeight: 20,
  },
  sourceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  sourceButtonText: {
    color: colors.accentLight,
    fontSize: 15,
    fontWeight: '600',
  },
  sourcePlatform: {
    color: colors.textMuted,
    fontSize: 12,
  },
});
