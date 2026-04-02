import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { colors, spacing, borderRadius } from '@/src/constants/theme';
import { detectPlatform } from '@/src/services/thumbnail';
import { createEntry } from '@/src/db/entries';
import { processEntry } from '@/src/services/processing';
import type { SourcePlatform } from '@/src/types';

const PLATFORM_LABELS: Record<SourcePlatform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram Reels',
  youtube: 'YouTube',
};

const PLATFORM_ICONS: Record<SourcePlatform, string> = {
  tiktok: 'musical-notes',
  instagram: 'camera',
  youtube: 'play-circle',
};

export default function CaptureScreen() {
  const params = useLocalSearchParams<{ url?: string }>();
  const [url, setUrl] = useState(params.url || '');
  const [platform, setPlatform] = useState<SourcePlatform | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPlatform(url ? detectPlatform(url) : null);
  }, [url]);

  const handleSave = useCallback(async () => {
    if (!url || !platform) {
      Alert.alert('Missing URL', 'Please enter a valid TikTok, Instagram, or YouTube URL.');
      return;
    }

    setSaving(true);
    try {
      const id = randomUUID();
      await createEntry({
        id,
        title: null,
        summary: null,
        category: null,
        tags: null,
        key_details: null,
        source_url: url,
        source_platform: platform,
        video_transcript: null,
        processing_status: 'pending',
        created_at: new Date().toISOString(),
      });

      // Fire and forget — processing happens in background
      processEntry(id);

      router.back();
    } catch (err) {
      console.error('Save failed:', err);
      Alert.alert('Error', 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [url, platform]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.body}>
        {/* Platform icon */}
        <View style={styles.iconContainer}>
          <Ionicons
            name={(platform ? PLATFORM_ICONS[platform] : 'link') as any}
            size={52}
            color={platform ? colors.accentLight : colors.textMuted}
          />
        </View>

        {/* URL input */}
        <TextInput
          style={styles.urlInput}
          placeholder="Paste TikTok, Instagram, or YouTube URL..."
          placeholderTextColor={colors.placeholder}
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={!params.url}
        />

        {/* Platform badge */}
        {platform && (
          <Text style={styles.platformBadge}>{PLATFORM_LABELS[platform]}</Text>
        )}
      </View>

      {/* Save button */}
      <Pressable
        onPress={handleSave}
        disabled={saving || !platform}
        style={[styles.saveButton, (!platform || saving) && styles.saveButtonDisabled]}
      >
        {saving ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={styles.saveText}>Add to Knowledge Base</Text>
        )}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl + 16,
    justifyContent: 'space-between',
  },
  body: {
    flex: 1,
    gap: spacing.md,
    alignItems: 'stretch',
  },
  iconContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  urlInput: {
    backgroundColor: colors.searchBg,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  platformBadge: {
    color: colors.accentLight,
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 8,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveText: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
});
