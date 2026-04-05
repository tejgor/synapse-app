import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  SectionList,
  StyleSheet,
  RefreshControl,
  Alert,
  Pressable,
} from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import {
  colors, spacing, borderRadius, shadows, typography, animation, categoryColor, categoryTint,
} from '@/src/constants/theme';
import { EntryCard } from '@/src/components/EntryCard';
import { SynapsePulse } from '@/src/components/SynapsePulse';
import { useEntries } from '@/src/hooks/useEntries';
import { deleteEntry, updateEntry, clearAllEntries } from '@/src/db/entries';
import { processEntry } from '@/src/services/processing';
import {
  usePressAnimation, useEmptyStateEntrance, useSlideUp,
} from '@/src/utils/animations';
import { useCrystallize } from '@/src/utils/useCrystallize';
import type { Entry } from '@/src/types';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function groupEntries(entries: Entry[]) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);
  const today: Entry[] = [], thisWeek: Entry[] = [], earlier: Entry[] = [];
  for (const e of entries) {
    const d = new Date(e.created_at);
    if (d >= todayStart) today.push(e);
    else if (d >= weekStart) thisWeek.push(e);
    else earlier.push(e);
  }
  return { today, thisWeek, earlier };
}

// ─── Hero Card ────────────────────────────────────────────────────────────────
// Structurally different from standard cards — no card bg, floating large text

function HeroDeleteAction({ drag, onPress }: { drag: SharedValue<number>; onPress: () => void }) {
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(drag.value, [-80, 0], [1, 0.8], Extrapolation.CLAMP) }],
  }));
  return (
    <Pressable style={styles.heroDeleteAction} onPress={onPress}>
      <Animated.View style={animStyle}>
        <Ionicons name="trash-outline" size={17} color={colors.text} />
      </Animated.View>
    </Pressable>
  );
}

function HeroCard({
  entry, onPress, onDelete,
}: { entry: Entry; onPress: () => void; onDelete: () => void }) {
  const swipeableRef = useRef<SwipeableMethods>(null);
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation(0.98);
  const crystalStyle = useCrystallize({ delay: 0, seed: 0 });

  const renderRightActions = (_progress: SharedValue<number>, drag: SharedValue<number>) => (
    <HeroDeleteAction drag={drag} onPress={() => { swipeableRef.current?.close(); onDelete(); }} />
  );
  const catColor = entry.category ? categoryColor(entry.category) : colors.accent;
  const isProcessing =
    entry.processing_status === 'processing' || entry.processing_status === 'pending';
  const keyDetails = entry.key_details ? JSON.parse(entry.key_details) : [];
  const tags: string[] = entry.tags ? JSON.parse(entry.tags) : [];
  const date = new Date(entry.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });

  return (
    <Animated.View style={[styles.heroWrapper, crystalStyle]}>
      <ReanimatedSwipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        rightThreshold={40}
        overshootRight={false}
      >
      <AnimatedPressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[styles.heroContent, animatedStyle]}
      >
        {/* Category + date row */}
        <View style={styles.heroMetaRow}>
          {entry.category && (
            <View style={[styles.heroCategoryPill, { backgroundColor: `${catColor}22` }]}>
              <View style={[styles.heroCategoryDot, { backgroundColor: catColor }]} />
              <Text style={[styles.heroCategoryLabel, { color: catColor }]}>{entry.category}</Text>
            </View>
          )}
          <Text style={styles.heroDate}>{date}</Text>
        </View>

        {/* Accent bar + title row */}
        <View style={styles.heroTitleRow}>
          <View style={[styles.heroAccentBar, { backgroundColor: catColor }]} />
          <View style={styles.heroTitleBlock}>
            {entry.title ? (
              <Text style={styles.heroTitle} numberOfLines={3}>{entry.title}</Text>
            ) : isProcessing ? (
              <Text style={styles.heroProcessing}>Extracting knowledge...</Text>
            ) : entry.processing_status === 'failed' ? (
              <Text style={styles.heroFailed}>Analysis failed</Text>
            ) : null}
          </View>
        </View>

        {/* Summary */}
        {entry.summary && (
          <Text style={styles.heroSummary} numberOfLines={2}>{entry.summary}</Text>
        )}

        {/* Stats row */}
        {(keyDetails.length > 0 || tags.length > 0) && !isProcessing && (
          <View style={styles.heroStatsRow}>
            {keyDetails.length > 0 && (
              <Text style={styles.heroStat}>{keyDetails.length} insights</Text>
            )}
            {keyDetails.length > 0 && tags.length > 0 && (
              <Text style={styles.heroStatSep}>·</Text>
            )}
            {tags.length > 0 && (
              <Text style={styles.heroStat}>{tags.length} tags</Text>
            )}
          </View>
        )}
      </AnimatedPressable>
      </ReanimatedSwipeable>

      {/* Bottom separator — visually ends the hero zone */}
      <View style={styles.heroSeparator} />
    </Animated.View>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ count, cats }: { count: number; cats: number }) {
  const style = useSlideUp(0);
  return (
    <Animated.View style={[styles.statsBar, style]}>
      <Text style={styles.statText}>
        <Text style={styles.statNum}>{count}</Text> entries
        <Text style={styles.statSep}>  ·  </Text>
        <Text style={styles.statNum}>{cats}</Text> categories
      </Text>
    </Animated.View>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionCount}>{count}</Text>
      <View style={styles.sectionLine} />
    </View>
  );
}

// ─── Search ───────────────────────────────────────────────────────────────────

function SearchBar({ value, onChangeText }: { value: string; onChangeText: (t: string) => void }) {
  const focused = useSharedValue(0);
  const animStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focused.value, [0, 1], [colors.border, colors.accent]),
    backgroundColor: interpolateColor(
      focused.value, [0, 1], [colors.searchBg, colors.surfaceOverlay]
    ),
  }));
  return (
    <Animated.View style={[styles.searchRow, animStyle]}>
      <Ionicons name="search" size={15} color={colors.textPlaceholder} style={{ marginRight: 8 }} />
      <TextInput
        style={styles.searchInput}
        placeholder="Search knowledge..."
        placeholderTextColor={colors.textPlaceholder}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => { focused.value = withTiming(1, { duration: animation.duration.fast }); }}
        onBlur={() => { focused.value = withTiming(0, { duration: animation.duration.fast }); }}
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText('')} hitSlop={8}>
          <Ionicons name="close-circle" size={15} color={colors.textPlaceholder} />
        </Pressable>
      )}
    </Animated.View>
  );
}

// ─── FAB ──────────────────────────────────────────────────────────────────────

function FAB({ onPress, onLongPress }: { onPress: () => void; onLongPress: () => void }) {
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation(0.88);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePressIn = () => {
    onPressIn();
    holdTimer.current = setTimeout(onLongPress, 5000);
  };

  const handlePressOut = () => {
    onPressOut();
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  return (
    <SynapsePulse intensity="strong" radius={borderRadius.xl}>
      <AnimatedPressable
        style={[styles.fab, animatedStyle]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <Ionicons name="add" size={26} color={colors.text} />
      </AnimatedPressable>
    </SynapsePulse>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onPress }: { onPress: () => void }) {
  const iconStyle = useEmptyStateEntrance(0);
  const titleStyle = useEmptyStateEntrance(1);
  const subStyle = useEmptyStateEntrance(2);
  const btnStyle = useEmptyStateEntrance(3);
  const { animatedStyle: ps, onPressIn, onPressOut } = usePressAnimation(0.96);
  return (
    <View style={styles.emptyState}>
      <Animated.View style={[styles.emptyHalo, iconStyle]}>
        <View style={styles.emptyRing2} />
        <View style={styles.emptyRing1} />
        <Ionicons name="sparkles" size={32} color={colors.accentMuted} />
      </Animated.View>
      <Animated.Text style={[styles.emptyTitle, titleStyle]}>Your knowledge base</Animated.Text>
      <Animated.Text style={[styles.emptySub, subStyle]}>
        Share a video link to start{'\n'}capturing insights
      </Animated.Text>
      <Animated.View style={btnStyle}>
        <AnimatedPressable
          style={[styles.emptyBtn, ps]}
          onPress={onPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
        >
          <Text style={styles.emptyBtnText}>Add a link</Text>
        </AnimatedPressable>
      </Animated.View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

type Section = { title: string; data: Entry[]; variant: 'standard' | 'compact' };

export default function LibraryScreen() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | undefined>();
  const { entries, loading, refresh } = useEntries(search || undefined, activeCategory);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const handleDelete = useCallback((id: string) => {
    Alert.alert('Delete entry', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => { await deleteEntry(id); refresh(); },
      },
    ]);
  }, [refresh]);

  const handleClearAll = useCallback(() => {
    Alert.alert(
      'Clear all entries',
      'This will permanently delete every entry in your local database. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything', style: 'destructive',
          onPress: async () => { await clearAllEntries(); refresh(); },
        },
      ]
    );
  }, [refresh]);

  const handleFailedPress = useCallback((id: string) => {
    Alert.alert('Analysis failed', 'Would you like to retry or remove this entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => { await deleteEntry(id); refresh(); },
      },
      {
        text: 'Retry',
        onPress: async () => {
          await updateEntry(id, { processing_status: 'pending' });
          refresh();
          processEntry(id);
        },
      },
    ]);
  }, [refresh]);

  const heroIndex = entries.findIndex((e) => e.processing_status === 'completed');
  const heroEntry = heroIndex >= 0 ? entries[heroIndex] : null;
  const rest = heroEntry
    ? [...entries.slice(0, heroIndex), ...entries.slice(heroIndex + 1)]
    : entries;
  const { today, thisWeek, earlier } = useMemo(() => groupEntries(rest), [rest]);
  const sections = useMemo<Section[]>(() => {
    const r: Section[] = [];
    if (today.length) r.push({ title: 'Today', data: today, variant: 'standard' });
    if (thisWeek.length) r.push({ title: 'This Week', data: thisWeek, variant: 'standard' });
    if (earlier.length) r.push({ title: 'Earlier', data: earlier, variant: 'compact' });
    return r;
  }, [today, thisWeek, earlier]);

  const categories = useMemo(
    () => [...new Set(entries.map((e) => e.category).filter(Boolean))] as string[],
    [entries]
  );

  const isSearching = search.length > 0;
  const showEmpty = entries.length === 0 && !loading;

  const listData: Section[] = isSearching
    ? [{ title: '', data: entries, variant: 'standard' }]
    : sections;

  return (
    <View style={styles.container}>
      {showEmpty ? (
        <View style={styles.emptyContainer}>
          <EmptyState onPress={() => router.push('/capture')} />
        </View>
      ) : (
        <SectionList
          sections={listData}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index, section }) => (
            <EntryCard
              entry={item}
              index={index + 1}
              variant={(section as Section).variant}
              onPress={() =>
              item.processing_status === 'failed'
                ? handleFailedPress(item.id)
                : router.push(`/entry/${item.id}`)
            }
              onCategoryPress={(cat) => setActiveCategory((c) => c === cat ? undefined : cat)}
              onDelete={() => handleDelete(item.id)}
            />
          )}
          renderSectionHeader={({ section }) =>
            !isSearching && (section as Section).data.length > 0 ? (
              <SectionHeader
                title={(section as Section).title}
                count={(section as Section).data.length}
              />
            ) : null
          }
          ListHeaderComponent={
            <View>
              {!isSearching && (
                <StatsBar count={entries.length} cats={categories.length} />
              )}
              <View style={styles.searchWrapper}>
                <SearchBar value={search} onChangeText={setSearch} />
              </View>
              {isSearching && entries.length > 0 && (
                <Text style={styles.searchResultLabel}>
                  {entries.length} result{entries.length !== 1 ? 's' : ''}
                </Text>
              )}
              {!isSearching && heroEntry && (
                <HeroCard
                  entry={heroEntry}
                  onPress={() =>
                    heroEntry.processing_status === 'failed'
                      ? handleFailedPress(heroEntry.id)
                      : router.push(`/entry/${heroEntry.id}`)
                  }
                  onDelete={() => handleDelete(heroEntry.id)}
                />
              )}
            </View>
          }
          ListEmptyComponent={
            isSearching ? (
              <View style={styles.searchEmpty}>
                <Text style={styles.searchEmptyText}>No results for "{search}"</Text>
              </View>
            ) : null
          }
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.accent} />
          }
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
        />
      )}

      <View style={styles.fabContainer}>
        <FAB onPress={() => router.push('/capture')} onLongPress={handleClearAll} />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Stats
  statsBar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: 6,
  },
  statText: { color: colors.textTertiary, fontSize: 12 },
  statNum: { color: colors.textSecondary, fontWeight: '600' },
  statSep: { color: colors.textPlaceholder },

  // Search
  searchWrapper: {
    paddingHorizontal: spacing.md,
    paddingBottom: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.searchBg,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
  },
  searchResultLabel: {
    ...typography.mono,
    color: colors.textTertiary,
    paddingHorizontal: spacing.md,
    paddingBottom: 8,
  },
  searchEmpty: { paddingTop: spacing.xl, alignItems: 'center', paddingHorizontal: spacing.md },
  searchEmptyText: { color: colors.textTertiary, fontSize: 15 },

  // Hero card — no card background, floating text
  heroWrapper: {
    marginHorizontal: spacing.md,
    marginBottom: 4,
    marginTop: 4,
  },
  heroContent: {
    paddingVertical: 20,
    paddingRight: 8,
    gap: 12,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroCategoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 5,
  },
  heroCategoryDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  heroCategoryLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  heroDate: { ...typography.mono, color: colors.textPlaceholder },
  heroTitleRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  heroAccentBar: {
    width: 5,
    borderRadius: 3,
    marginTop: 4,
    height: 56,
  },
  heroTitleBlock: { flex: 1 },
  heroTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 35,
    letterSpacing: -0.5,
  },
  heroProcessing: { color: colors.textTertiary, fontSize: 18, fontStyle: 'italic' },
  heroFailed: { color: colors.error, fontSize: 18, fontStyle: 'italic' },
  heroSummary: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    paddingLeft: 19, // align with title (bar width 5 + gap 14)
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 19,
  },
  heroStat: { ...typography.mono, color: colors.textPlaceholder, fontSize: 10 },
  heroStatSep: { color: colors.textPlaceholder, fontSize: 10 },
  heroDeleteAction: {
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderRadius: 12,
    marginLeft: 12,
  },
  heroSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginTop: 8,
  },

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: 20,
    paddingBottom: 8,
    gap: 8,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.textTertiary,
  },
  sectionCount: {
    ...typography.mono,
    fontSize: 10,
    color: colors.textPlaceholder,
  },
  sectionLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
  },

  // List
  listContent: { paddingBottom: 110 },

  // Empty state
  emptyContainer: { flex: 1, justifyContent: 'center' },
  emptyState: { alignItems: 'center', paddingHorizontal: spacing.xl, gap: spacing.md },
  emptyHalo: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: colors.accentSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
    position: 'relative',
  },
  emptyRing1: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 1,
    borderColor: colors.accent,
    opacity: 0.18,
  },
  emptyRing2: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent,
    opacity: 0.12,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  emptySub: {
    color: colors.textTertiary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyBtn: {
    marginTop: 4,
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
    paddingHorizontal: 28,
    paddingVertical: 12,
    ...shadows.glow,
  },
  emptyBtnText: { color: colors.text, fontSize: 15, fontWeight: '600' },

  // FAB
  fabContainer: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.lg,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.glow,
  },
});
