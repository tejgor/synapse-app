import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import { colors, spacing, borderRadius, shadows, animation } from '@/src/constants/theme';
import { detectPlatform } from '@/src/services/thumbnail';
import { createEntry } from '@/src/db/entries';
import { processEntry } from '@/src/services/processing';
import type { SourcePlatform } from '@/src/types';
import { usePressAnimation } from '@/src/utils/animations';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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

  const inputFocused = useSharedValue(0);
  const { animatedStyle: buttonPressStyle, onPressIn, onPressOut } = usePressAnimation(0.97);

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

      processEntry(id);
      router.back();
    } catch (err) {
      console.error('Save failed:', err);
      Alert.alert('Error', 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [url, platform]);

  const animatedInputStyle = useAnimatedStyle(() => ({
    borderWidth: 1,
    borderColor: interpolateColor(
      inputFocused.value,
      [0, 1],
      ['transparent', colors.accentMuted]
    ),
    backgroundColor: interpolateColor(
      inputFocused.value,
      [0, 1],
      [colors.surface, colors.surfaceOverlay]
    ),
  }));

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.body}>
        {/* Platform icon */}
        <View style={styles.iconContainer}>
          <View style={styles.iconCircle}>
            <Ionicons
              name={(platform ? PLATFORM_ICONS[platform] : 'link') as any}
              size={34}
              color={platform ? colors.accent : colors.textTertiary}
            />
          </View>
        </View>

        {/* URL input */}
        <Animated.View style={[styles.urlInputWrapper, animatedInputStyle]}>
          <TextInput
            style={styles.urlInput}
            placeholder="Paste TikTok, Instagram, or YouTube URL..."
            placeholderTextColor={colors.textPlaceholder}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={!params.url}
            onFocus={() => { inputFocused.value = withTiming(1, { duration: animation.duration.fast }); }}
            onBlur={() => { inputFocused.value = withTiming(0, { duration: animation.duration.fast }); }}
          />
        </Animated.View>

        {/* Platform badge */}
        {platform && (
          <Text style={styles.platformBadge}>{PLATFORM_LABELS[platform]}</Text>
        )}
      </View>

      {/* Save button */}
      <AnimatedPressable
        onPress={handleSave}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={saving || !platform}
        style={[styles.saveButton, (!platform || saving) && styles.saveButtonDisabled, buttonPressStyle]}
      >
        {saving ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={styles.saveText}>Add to Knowledge Base</Text>
        )}
      </AnimatedPressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
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
    paddingVertical: spacing.xxl,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceRaised,
    justifyContent: 'center',
    alignItems: 'center',
  },
  urlInputWrapper: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: colors.surface,
  },
  urlInput: {
    padding: 18,
    color: colors.text,
    fontSize: 16,
  },
  platformBadge: {
    color: colors.accent,
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: 20,
    paddingVertical: spacing.md,
    alignItems: 'center',
    ...shadows.glow,
  },
  saveButtonDisabled: {
    opacity: 0.35,
  },
  saveText: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
});
