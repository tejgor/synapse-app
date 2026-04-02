import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { colors, spacing, borderRadius } from '@/src/constants/theme';
import { EntryCard } from '@/src/components/EntryCard';
import { TopicTag } from '@/src/components/TopicTag';
import { useEntries } from '@/src/hooks/useEntries';
import { deleteEntry } from '@/src/db/entries';

export default function LibraryScreen() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | undefined>();
  const { entries, loading, refresh } = useEntries(search || undefined, activeCategory);

  // Refresh when screen comes into focus
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

  // Collect unique categories for filter bar
  const categories = [...new Set(entries.map((e) => e.category).filter(Boolean))] as string[];

  return (
    <View style={styles.container}>
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <EntryCard
            entry={item}
            onPress={() => router.push(`/entry/${item.id}`)}
            onCategoryPress={handleCategoryPress}
            onDelete={() => handleDelete(item.id)}
          />
        )}
        ListHeaderComponent={
          <>
            <View style={styles.searchContainer}>
              <View style={styles.searchRow}>
                <Ionicons name="search" size={16} color={colors.placeholder} style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search your knowledge..."
                  placeholderTextColor={colors.placeholder}
                  value={search}
                  onChangeText={setSearch}
                />
              </View>
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
          <View style={styles.emptyState}>
            <Ionicons name="bulb" size={56} color={colors.textMuted} style={styles.emptyIcon} />
            <Text style={styles.emptyTitle}>No knowledge yet</Text>
            <Text style={styles.emptySubtitle}>
              Share a video link to start building{'\n'}your knowledge base
            </Text>
            <Pressable
              style={styles.manualButton}
              onPress={() => router.push('/capture')}
            >
              <Text style={styles.manualButtonText}>+ Add link</Text>
            </Pressable>
          </View>
        }
      />

      {/* FAB */}
      {entries.length > 0 && (
        <Pressable
          style={styles.fab}
          onPress={() => router.push('/capture')}
        >
          <Ionicons name="add" size={28} color={colors.text} />
        </Pressable>
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
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.searchBg,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.sm + 4,
  },
  searchIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.sm + 4,
    color: colors.text,
    fontSize: 15,
  },
  tagBar: {
    paddingBottom: spacing.sm,
  },
  tagList: {
    paddingHorizontal: spacing.md,
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
    gap: spacing.sm,
  },
  emptyIcon: {
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  manualButton: {
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 4,
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
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});
