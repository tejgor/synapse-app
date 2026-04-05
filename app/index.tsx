import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  RefreshControl,
  Alert,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { colors, spacing, borderRadius, shadows, animation } from '@/src/constants/theme';
import { EntryCard } from '@/src/components/EntryCard';
import { TopicTag } from '@/src/components/TopicTag';
import { useEntries } from '@/src/hooks/useEntries';
import { deleteEntry } from '@/src/db/entries';
import { usePressAnimation, useEmptyStateEntrance } from '@/src/utils/animations';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function FAB({ onPress }: { onPress: () => void }) {
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation(0.88);
  return (
    <AnimatedPressable
      style={[styles.fab, animatedStyle]}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
    >
      <Ionicons name="add" size={26} color={colors.text} />
    </AnimatedPressable>
  );
}

function EmptyState({ onPress }: { onPress: () => void }) {
  const iconStyle = useEmptyStateEntrance(0);
  const titleStyle = useEmptyStateEntrance(1);
  const subtitleStyle = useEmptyStateEntrance(2);
  const buttonStyle = useEmptyStateEntrance(3);
  const { animatedStyle: pressStyle, onPressIn, onPressOut } = usePressAnimation(0.96);

  return (
    <View style={styles.emptyState}>
      <Animated.View style={[styles.emptyIconHalo, iconStyle]}>
        <Ionicons name="sparkles" size={36} color={colors.accentMuted} />
      </Animated.View>
      <Animated.Text style={[styles.emptyTitle, titleStyle]}>
        Your knowledge base
      </Animated.Text>
      <Animated.Text style={[styles.emptySubtitle, subtitleStyle]}>
        Share a video link to start{'\n'}capturing insights
      </Animated.Text>
      <AnimatedPressable
        style={[styles.manualButton, buttonStyle, pressStyle]}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      >
        <Text style={styles.manualButtonText}>Add link</Text>
      </AnimatedPressable>
    </View>
  );
}

function SearchBar({ value, onChangeText }: { value: string; onChangeText: (t: string) => void }) {
  const focused = useSharedValue(0);

  const animatedBorderStyle = useAnimatedStyle(() => ({
    borderWidth: 1,
    borderColor: interpolateColor(
      focused.value,
      [0, 1],
      ['transparent', colors.accentMuted]
    ),
    backgroundColor: interpolateColor(
      focused.value,
      [0, 1],
      [colors.searchBg, colors.surfaceOverlay]
    ),
  }));

  return (
    <Animated.View style={[styles.searchRow, animatedBorderStyle]}>
      <Ionicons name="search" size={18} color={colors.textPlaceholder} style={styles.searchIcon} />
      <TextInput
        style={styles.searchInput}
        placeholder="Search your knowledge..."
        placeholderTextColor={colors.textPlaceholder}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => { focused.value = withTiming(1, { duration: animation.duration.fast }); }}
        onBlur={() => { focused.value = withTiming(0, { duration: animation.duration.fast }); }}
      />
    </Animated.View>
  );
}

export default function LibraryScreen() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | undefined>();
  const { entries, loading, refresh } = useEntries(search || undefined, activeCategory);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleCategoryPress = useCallback((category: string) => {
    setActiveCategory((current) => (current === category ? undefined : category));
  }, []);

  const handleDelete = useCallback((id: string) => {
    Alert.alert('Delete entry', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteEntry(id);
          refresh();
        },
      },
    ]);
  }, [refresh]);

  const categories = [...new Set(entries.map((e) => e.category).filter(Boolean))] as string[];

  return (
    <View style={styles.container}>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <EntryCard
            entry={item}
            index={index}
            onPress={() => router.push(`/entry/${item.id}`)}
            onCategoryPress={handleCategoryPress}
            onDelete={() => handleDelete(item.id)}
          />
        )}
        ListHeaderComponent={
          <>
            <View style={styles.searchContainer}>
              <SearchBar value={search} onChangeText={setSearch} />
            </View>
            {categories.length > 0 && (
              <View style={styles.tagBar}>
                <FlatList
                  horizontal
                  data={categories}
                  keyExtractor={(item) => item}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.tagList}
                  renderItem={({ item }) => (
                    <TopicTag
                      tag={item}
                      active={activeCategory === item}
                      onPress={() => handleCategoryPress(item)}
                    />
                  )}
                />
              </View>
            )}
          </>
        }
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refresh}
            tintColor={colors.accent}
          />
        }
        contentContainerStyle={entries.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <EmptyState onPress={() => router.push('/capture')} />
        }
      />

      {entries.length > 0 && (
        <FAB onPress={() => router.push('/capture')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.searchBg,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  tagBar: {
    paddingBottom: spacing.md,
  },
  tagList: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  listContent: {
    paddingTop: spacing.md,
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emptyIconHalo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accentSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    color: colors.textTertiary,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  manualButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
    ...shadows.glow,
  },
  manualButtonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    bottom: spacing.xl,
    right: spacing.lg,
    width: 58,
    height: 58,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.glow,
  },
});
