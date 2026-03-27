import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
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
import { RecordButton } from '@/src/components/RecordButton';
import { useRecorder } from '@/src/hooks/useRecorder';
import { detectPlatform, getThumbnail } from '@/src/services/thumbnail';
import { createEntry } from '@/src/db/entries';
import { processEntry } from '@/src/services/processing';
import type { SourcePlatform } from '@/src/types';

export default function CaptureScreen() {
  const params = useLocalSearchParams<{ url?: string }>();
  const [url, setUrl] = useState(params.url || '');
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [platform, setPlatform] = useState<SourcePlatform | null>(null);
  const [loadingThumb, setLoadingThumb] = useState(false);
  const [saving, setSaving] = useState(false);

  const { isRecording, duration, audioUri, startRecording, stopRecording } = useRecorder();

  // Fetch thumbnail when URL changes
  useEffect(() => {
    if (!url) return;
    const detected = detectPlatform(url);
    setPlatform(detected);

    if (detected) {
      setLoadingThumb(true);
      getThumbnail(url)
        .then(setThumbnailUrl)
        .finally(() => setLoadingThumb(false));
    }
  }, [url]);

  const handleRecordToggle = useCallback(async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const isYouTube = platform === 'youtube';

  const handleSave = useCallback(async () => {
    if (!url || !platform) {
      Alert.alert('Missing URL', 'Please enter a valid video URL.');
      return;
    }
    if (!isYouTube && !audioUri) {
      Alert.alert('No recording', 'Please record a voice note before saving.');
      return;
    }

    setSaving(true);
    try {
      const id = randomUUID();
      await createEntry({
        id,
        source_platform: platform,
        video_url: url,
        thumbnail_url: thumbnailUrl,
        voice_note_path: isYouTube ? null : audioUri,
        voice_note_transcript: null,
        video_transcript: null,
        key_learnings: null,
        highlights: null,
        topic_tag: null,
        processing_status: 'pending',
        created_at: new Date().toISOString(),
      });

      // Fire and forget — processing happens in background
      processEntry(id);

      router.back();
    } catch (err) {
      console.error('Save failed:', err);
      Alert.alert('Error', 'Failed to save entry. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [url, platform, isYouTube, audioUri, thumbnailUrl]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Thumbnail preview */}
      <View style={styles.thumbnailSection}>
        {loadingThumb ? (
          <View style={styles.thumbPlaceholder}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : thumbnailUrl ? (
          <Image source={{ uri: thumbnailUrl }} style={styles.thumbnail} />
        ) : (
          <View style={styles.thumbPlaceholder}>
            <Ionicons
              name={platform === 'tiktok' ? 'musical-notes' : platform === 'instagram' ? 'camera' : platform === 'youtube' ? 'play-circle' : 'link'}
              size={48}
              color={colors.textMuted}
            />
          </View>
        )}
      </View>

      {/* URL input (for manual testing) */}
      {!params.url && (
        <TextInput
          style={styles.urlInput}
          placeholder="Paste TikTok, Reels, or YouTube URL..."
          placeholderTextColor={colors.placeholder}
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
        />
      )}

      {/* Platform badge */}
      {platform && (
        <Text style={styles.platformBadge}>
          {platform === 'tiktok' ? 'TikTok' : platform === 'instagram' ? 'Instagram Reels' : 'YouTube'}
        </Text>
      )}

      {/* Record button (hidden for YouTube — no voice note needed) */}
      {!isYouTube && (
        <View style={styles.recordSection}>
          <RecordButton
            isRecording={isRecording}
            duration={duration}
            onPress={handleRecordToggle}
          />
          {audioUri && !isRecording && (
            <Text style={styles.recordedLabel}>Voice note recorded ✓</Text>
          )}
        </View>
      )}

      {isYouTube && (
        <View style={styles.recordSection}>
          <Text style={styles.youtubeHint}>
            We'll extract the key highlights with timestamps so you can watch what matters most.
          </Text>
        </View>
      )}

      {/* Save button */}
      <Pressable
        onPress={handleSave}
        disabled={saving || (!isYouTube && !audioUri) || !platform}
        style={[
          styles.saveButton,
          ((!isYouTube && !audioUri) || !platform || saving) && styles.saveButtonDisabled,
        ]}
      >
        {saving ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={styles.saveText}>Save</Text>
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
    paddingTop: spacing.lg,
    justifyContent: 'space-between',
    paddingBottom: spacing.xl + 16,
  },
  thumbnailSection: {
    alignItems: 'center',
  },
  thumbnail: {
    width: 240,
    height: 310,
    borderRadius: borderRadius.lg,
  },
  thumbPlaceholder: {
    width: 240,
    height: 310,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  urlInput: {
    backgroundColor: colors.searchBg,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    color: colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  platformBadge: {
    color: colors.accentLight,
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },
  recordSection: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  recordedLabel: {
    color: colors.success,
    fontSize: 14,
    fontWeight: '600',
  },
  youtubeHint: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
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
