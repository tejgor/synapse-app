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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, shadows, typography, animation } from '@/src/constants/theme';
import { TopicTag } from '@/src/components/TopicTag';
import { TagPill } from '@/src/components/TagPill';
import { KeyDetailRow } from '@/src/components/KeyDetailRow';
import { getEntryById } from '@/src/db/entries';
import type { Entry, KeyDetail } from '@/src/types';
import { usePressAnimation } from '@/src/utils/animations';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram Reels',
  youtube: 'YouTube',
};

function SourceButton({ onPress, text, platform }: { onPress: () => void; text: string; platform: string }) {
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation(0.975);
  return (
    <AnimatedPressable
      style={[styles.sourceButton, animatedStyle]}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
    >
      <View>
        <Text style={styles.sourceButtonText}>{text}</Text>
        <Text style={styles.sourcePlatform}>{platform}</Text>
      </View>
      <Ionicons name="open-outline" size={16} color={colors.textTertiary} />
    </AnimatedPressable>
  );
}

function TranscriptSection({ transcript }: { transcript: string }) {
  const [open, setOpen] = useState(false);
  const progress = useSharedValue(0);

  const toggle = useCallback(() => {
    const next = !open;
    setOpen(next);
    progress.value = withTiming(next ? 1 : 0, { duration: animation.duration.normal });
  }, [open]);

  const animatedContentStyle = useAnimatedStyle(() => ({
    maxHeight: interpolate(progress.value, [0, 1], [0, 4000]),
    opacity: interpolate(progress.value, [0, 0.4, 1], [0, 0, 1]),
    overflow: 'hidden',
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(progress.value, [0, 1], [0, 180])}deg` }],
  }));

  return (
    <View style={styles.section}>
      <Pressable style={styles.transcriptToggle} onPress={toggle}>
        <Text style={styles.sectionTitle}>Transcript</Text>
        <Animated.View style={chevronStyle}>
          <Ionicons name="chevron-down" size={16} color={colors.textTertiary} />
        </Animated.View>
      </Pressable>
      <Animated.View style={animatedContentStyle}>
        <View style={styles.transcriptCard}>
          <Text style={styles.transcriptText}>{transcript}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getEntryById(id)
      .then(setEntry)
      .finally(() => setLoading(false));
  }, [id]);

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
          <ActivityIndicator size="small" color={colors.warning} />
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

      {/* Transcript (collapsible with animation) */}
      {entry.video_transcript && (
        <TranscriptSection transcript={entry.video_transcript} />
      )}

      {/* Source link */}
      <SourceButton
        onPress={() => Linking.openURL(entry.source_url)}
        text="View source"
        platform={platformLabel}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: 80,
    gap: 40,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: colors.textTertiary,
    fontSize: 16,
  },
  header: {
    gap: 20,
  },
  headerMeta: {
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
    ...typography.heading,
  },
  summary: {
    color: colors.textSecondary,
    ...typography.body,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  processingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  failedBanner: {
    backgroundColor: colors.errorSubtle,
  },
  processingText: {
    color: colors.textSecondary,
    ...typography.caption,
  },
  failedText: {
    color: colors.error,
    ...typography.caption,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textTertiary,
    ...typography.overline,
  },
  detailsCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: 20,
    ...shadows.sm,
  },
  detailDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginVertical: spacing.xs,
  },
  transcriptToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  transcriptCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: 20,
    ...shadows.sm,
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
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    ...shadows.sm,
  },
  sourceButtonText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  sourcePlatform: {
    color: colors.textTertiary,
    ...typography.caption,
    marginTop: 2,
  },
});
