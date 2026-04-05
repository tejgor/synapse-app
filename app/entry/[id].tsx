import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Linking,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolate,
} from 'react-native-reanimated';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  colors, spacing, borderRadius, shadows, typography, animation, categoryColor, categoryTint,
} from '@/src/constants/theme';
import { getEntryById } from '@/src/db/entries';
import type { Entry, KeyDetail } from '@/src/types';
import { usePressAnimation } from '@/src/utils/animations';
import { useCrystallize } from '@/src/utils/useCrystallize';
import { SynapsePulse } from '@/src/components/SynapsePulse';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const { width: SCREEN_WIDTH } = Dimensions.get('window');
// 2-col grid: 24px margins each side + 12px gap
const CARD_WIDTH = (SCREEN_WIDTH - spacing.lg * 2 - 12) / 2;

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram Reels',
  youtube: 'YouTube',
};
const PLATFORM_ICONS: Record<string, string> = {
  tiktok: 'logo-tiktok',
  instagram: 'logo-instagram',
  youtube: 'logo-youtube',
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

// ─── Ornamental divider ───────────────────────────────────────────────────────

function NodeDivider({ catColor }: { catColor: string }) {
  return (
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      <View style={[styles.dividerNode, { backgroundColor: catColor }]} />
      <View style={styles.dividerLine} />
    </View>
  );
}

// ─── Insight mini-card ────────────────────────────────────────────────────────

function InsightCard({
  label, value, delay, catColor,
}: { label: string; value: string; delay: number; catColor: string }) {
  const crystalStyle = useCrystallize({ delay, seed: delay });
  const isUrl = value.startsWith('http://') || value.startsWith('https://');
  return (
    <Animated.View style={[styles.insightCard, crystalStyle]}>
      {/* Category-colored top accent — 4px, full opacity */}
      <View style={[styles.insightAccent, { backgroundColor: catColor }]} />
      <Text style={styles.insightLabel}>{label}</Text>
      {isUrl ? (
        <Pressable onPress={() => Linking.openURL(value)}>
          <Text style={styles.insightLink} numberOfLines={2}>{value}</Text>
        </Pressable>
      ) : (
        <Text style={styles.insightValue} numberOfLines={3}>{value}</Text>
      )}
    </Animated.View>
  );
}

// ─── Transcript ───────────────────────────────────────────────────────────────

function TranscriptSection({ transcript }: { transcript: string }) {
  const [expanded, setExpanded] = useState(false);
  const progress = useSharedValue(0);

  const toggle = useCallback(() => {
    const next = !expanded;
    setExpanded(next);
    progress.value = withTiming(next ? 1 : 0, { duration: animation.duration.normal });
  }, [expanded]);

  const expandStyle = useAnimatedStyle(() => ({
    maxHeight: interpolate(progress.value, [0, 1], [0, 6000]),
    opacity: interpolate(progress.value, [0, 0.4, 1], [0, 0, 1]),
    overflow: 'hidden',
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(progress.value, [0, 1], [0, 180])}deg` }],
  }));

  return (
    <View style={styles.transcriptWrapper}>
      <View style={styles.transcriptPreviewBlock}>
        <Text style={styles.transcriptText} numberOfLines={expanded ? undefined : 4}>
          {transcript}
        </Text>
        {!expanded && <View style={styles.transcriptFade} pointerEvents="none" />}
      </View>
      <Pressable style={styles.transcriptToggle} onPress={toggle}>
        <Text style={styles.transcriptToggleText}>
          {expanded ? 'Collapse' : 'Read full transcript'}
        </Text>
        <Animated.View style={chevronStyle}>
          <Ionicons name="chevron-down" size={13} color={colors.accentMuted} />
        </Animated.View>
      </Pressable>
      <Animated.View style={expandStyle}>
        <Text style={[styles.transcriptText, { marginTop: 12 }]}>{transcript}</Text>
      </Animated.View>
    </View>
  );
}

// ─── Floating source pill ─────────────────────────────────────────────────────

function SourcePill({ url, platform }: { url: string; platform: string }) {
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation(0.93);
  const platformIcon = PLATFORM_ICONS[platform] as any;

  return (
    <View style={styles.pillAnchor}>
      <SynapsePulse intensity="subtle" radius={99}>
        <AnimatedPressable
          style={[styles.sourcePill, animatedStyle]}
          onPress={() => Linking.openURL(url)}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
        >
          {platformIcon && (
            <Ionicons name={platformIcon} size={13} color={colors.textSecondary} style={{ marginRight: 6 }} />
          )}
          <Text style={styles.sourcePillText}>
            {PLATFORM_LABELS[platform] || platform}
          </Text>
          <Ionicons name="open-outline" size={12} color={colors.textTertiary} style={{ marginLeft: 5 }} />
        </AnimatedPressable>
      </SynapsePulse>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getEntryById(id).then(setEntry).finally(() => setLoading(false));
  }, [id]);

  // Crystallization delays for each section
  const titleCrystal = useCrystallize({ delay: 80, seed: 1 });
  const dateCrystal = useCrystallize({ delay: 120, seed: 2 });
  const quoteCrystal = useCrystallize({ delay: 180, seed: 3 });
  const tagsCrystal = useCrystallize({ delay: 230, seed: 4 });
  const insightsCrystal = useCrystallize({ delay: 280, seed: 5 });
  const transcriptCrystal = useCrystallize({ delay: 330, seed: 6 });

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!entry) {
    return (
      <View style={styles.loading}>
        <Text style={{ color: colors.textTertiary, fontSize: 15 }}>Entry not found</Text>
      </View>
    );
  }

  const tags: string[] = entry.tags ? JSON.parse(entry.tags) : [];
  const keyDetails: KeyDetail[] = entry.key_details ? JSON.parse(entry.key_details) : [];
  const catColor = entry.category ? categoryColor(entry.category) : colors.accent;
  const isProcessing =
    entry.processing_status === 'processing' || entry.processing_status === 'pending';

  const date = new Date(entry.created_at).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <View style={styles.outer}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Category pill ── */}
        {entry.category && (
          <Animated.View style={[styles.catRow, dateCrystal]}>
            <View style={[styles.catPill, { backgroundColor: `${catColor}22` }]}>
              <View style={[styles.catDot, { backgroundColor: catColor }]} />
              <Text style={[styles.catLabel, { color: catColor }]}>{entry.category}</Text>
            </View>
          </Animated.View>
        )}

        {/* ── Title — biggest element, crystallizes first ── */}
        {entry.title && (
          <Animated.Text style={[styles.title, titleCrystal]}>{entry.title}</Animated.Text>
        )}

        {/* ── Date in SpaceMono ── */}
        <Animated.Text style={[styles.date, dateCrystal]}>
          {entry.published_at
            ? `published ${new Date(entry.published_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · saved ${date}`
            : `saved ${date}`}
        </Animated.Text>

        {/* ── Video metadata row (author, duration, views, likes) ── */}
        {(entry.author_name || entry.duration != null || entry.view_count != null || entry.like_count != null) && (
          <Animated.View style={[styles.metaRow, dateCrystal]}>
            {entry.author_name != null && (
              <View style={styles.metaChip}>
                <Ionicons name="person-outline" size={11} color={colors.textTertiary} />
                <Text style={styles.metaText}>
                  {entry.author_name}{entry.author_username ? ` @${entry.author_username}` : ''}
                </Text>
              </View>
            )}
            {entry.duration != null && entry.duration > 0 && (
              <View style={styles.metaChip}>
                <Ionicons name="time-outline" size={11} color={colors.textTertiary} />
                <Text style={styles.metaText}>{formatDuration(entry.duration)}</Text>
              </View>
            )}
            {entry.view_count != null && (
              <View style={styles.metaChip}>
                <Ionicons name="eye-outline" size={11} color={colors.textTertiary} />
                <Text style={styles.metaText}>{formatCount(entry.view_count)} views</Text>
              </View>
            )}
            {entry.like_count != null && (
              <View style={styles.metaChip}>
                <Ionicons name="heart-outline" size={11} color={colors.textTertiary} />
                <Text style={styles.metaText}>{formatCount(entry.like_count)}</Text>
              </View>
            )}
          </Animated.View>
        )}

        {/* ── Summary as pull-quote with category-colored bar ── */}
        {entry.summary && (
          <Animated.View style={[styles.pullQuote, { backgroundColor: categoryTint(entry.category || '') }, quoteCrystal]}>
            <View style={[styles.pullBar, { backgroundColor: catColor }]} />
            <Text style={styles.pullText}>{entry.summary}</Text>
          </Animated.View>
        )}

        {/* ── Tags ── */}
        {tags.length > 0 && (
          <Animated.View style={[styles.tagsRow, tagsCrystal]}>
            {tags.map((tag) => (
              <View key={tag} style={styles.tagChip}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </Animated.View>
        )}

        {/* ── Processing / failed ── */}
        {isProcessing && (
          <View style={styles.banner}>
            <ActivityIndicator size="small" color={colors.warning} />
            <Text style={styles.bannerText}>Extracting knowledge...</Text>
          </View>
        )}
        {entry.processing_status === 'failed' && (
          <View style={[styles.banner, { backgroundColor: colors.errorSubtle }]}>
            <Ionicons name="warning-outline" size={15} color={colors.error} />
            <Text style={[styles.bannerText, { color: colors.error }]}>Processing failed.</Text>
          </View>
        )}

        {/* ── Node divider ── */}
        {keyDetails.length > 0 && <NodeDivider catColor={catColor} />}

        {/* ── Key insights grid ── */}
        {keyDetails.length > 0 && (
          <Animated.View style={insightsCrystal}>
            <Text style={styles.sectionLabel}>Insights</Text>
            <View style={styles.insightGrid}>
              {keyDetails.map((d: KeyDetail, i: number) => (
                <InsightCard
                  key={i}
                  label={d.label}
                  value={d.value}
                  catColor={catColor}
                  delay={280 + i * 60}
                />
              ))}
            </View>
          </Animated.View>
        )}

        {/* ── Node divider ── */}
        {entry.video_transcript && <NodeDivider catColor={catColor} />}

        {/* ── Transcript ── */}
        {entry.video_transcript && (
          <Animated.View style={transcriptCrystal}>
            <Text style={styles.sectionLabel}>Transcript</Text>
            <TranscriptSection transcript={entry.video_transcript} />
          </Animated.View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* ── Floating source pill ── */}
      <SourcePill url={entry.source_url} platform={entry.source_platform} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { paddingTop: spacing.lg, paddingHorizontal: spacing.lg, paddingBottom: 40, gap: 20 },
  loading: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' },

  // Header
  catRow: { flexDirection: 'row', alignItems: 'center' },
  catPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 5,
  },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 40,
    letterSpacing: -0.6,
    marginTop: 4,
  },
  date: {
    ...typography.mono,
    color: colors.textPlaceholder,
    marginTop: -4,
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: -6 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { ...typography.mono, color: colors.textTertiary, fontSize: 11 },

  // Pull-quote
  pullQuote: {
    flexDirection: 'row',
    gap: 14,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
    marginTop: 4,
  },
  pullBar: { width: 5, borderRadius: 3 },
  pullText: { flex: 1, color: colors.textSecondary, fontSize: 15, lineHeight: 23 },

  // Tags
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagChip: {
    backgroundColor: colors.accentSubtle,
    borderRadius: borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: { color: colors.textTertiary, fontSize: 11, fontWeight: '500' },

  // Banners
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.md, ...shadows.sm,
  },
  bannerText: { color: colors.textSecondary, ...typography.caption },

  // Divider
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSubtle },
  dividerNode: { width: 5, height: 5, borderRadius: 2.5, opacity: 0.45 },

  // Section label
  sectionLabel: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: 12,
  },

  // Insight grid
  insightGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  insightCard: {
    width: CARD_WIDTH,
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  insightAccent: { height: 4 },
  insightLabel: {
    ...typography.label,
    color: colors.textTertiary,
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 5,
  },
  insightValue: {
    color: colors.text, fontSize: 14, lineHeight: 20,
    paddingHorizontal: 12, paddingBottom: 12,
  },
  insightLink: {
    color: colors.accent, fontSize: 13, lineHeight: 18,
    paddingHorizontal: 12, paddingBottom: 12,
  },

  // Transcript
  transcriptWrapper: { gap: 0 },
  transcriptPreviewBlock: { position: 'relative' },
  transcriptText: { color: colors.textSecondary, fontSize: 13, lineHeight: 21 },
  transcriptFade: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 28, backgroundColor: colors.background, opacity: 0.88,
  },
  transcriptToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10,
  },
  transcriptToggleText: { color: colors.accentMuted, fontSize: 12, fontWeight: '600' },

  // Source pill
  pillAnchor: { position: 'absolute', bottom: 26, alignSelf: 'center' },
  sourcePill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: borderRadius.full,
    paddingHorizontal: 16, paddingVertical: 10,
    ...shadows.md,
    shadowOpacity: 0.28,
  },
  sourcePillText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
});
