import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Linking,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import {
  colors, spacing, borderRadius, shadows, typography, animation, platformColors,
} from '@/src/constants/theme';
import { detectPlatform } from '@/src/services/thumbnail';
import { createEntry } from '@/src/db/entries';
import { processEntry } from '@/src/services/processing';
import type { SourcePlatform } from '@/src/types';
import { useHeightReveal, useCollapseAnimation } from '@/src/utils/animations';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PLATFORM_LABELS: Record<SourcePlatform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram Reels',
  youtube: 'YouTube',
};
const PLATFORM_ICONS: Record<SourcePlatform, string> = {
  tiktok: 'logo-tiktok',
  instagram: 'logo-instagram',
  youtube: 'logo-youtube',
};
const PLATFORM_SCHEMES: Record<SourcePlatform, string> = {
  tiktok: 'tiktok://',
  instagram: 'instagram://',
  youtube: 'youtube://',
};

// ─── Ambient node — pulsing synapse orb in the backdrop ───────────────────────

function AmbientNode() {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.06);

  useEffect(() => {
    scale.value = withRepeat(
      withTiming(1.6, { duration: 3500, easing: Easing.inOut(Easing.sin) }),
      -1, true
    );
    opacity.value = withRepeat(
      withTiming(0.15, { duration: 3500, easing: Easing.inOut(Easing.sin) }),
      -1, true
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.ambientNode, style]} />;
}

// ─── Checkmark ────────────────────────────────────────────────────────────────

function CheckmarkFlash({ visible }: { visible: boolean }) {
  const scale = useSharedValue(0.2);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      scale.value = withSpring(1, animation.spring.snappy);
      opacity.value = withTiming(1, { duration: 150 });
    } else {
      scale.value = withTiming(0.2, { duration: 200 });
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [visible]);

  return (
    <Animated.View
      style={[styles.checkmark, useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
        opacity: opacity.value,
      }))]}
    >
      <Ionicons name="checkmark-circle" size={60} color={colors.accent} />
    </Animated.View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CaptureScreen() {
  const params = useLocalSearchParams<{ url?: string }>();
  const isFromShare = !!params.url;
  const [url, setUrl] = useState(params.url || '');
  const [platform, setPlatform] = useState<SourcePlatform | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCheck, setShowCheck] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const backdropOpacity = useSharedValue(0);
  const { trigger: triggerCollapse, animatedStyle: collapseStyle } = useCollapseAnimation();

  useEffect(() => {
    backdropOpacity.value = withTiming(1, { duration: 280 });
    setTimeout(() => inputRef.current?.focus(), 320);
  }, []);

  useEffect(() => {
    setPlatform(url ? detectPlatform(url) : null);
  }, [url]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));

  const dismiss = useCallback(() => {
    backdropOpacity.value = withTiming(0, { duration: 200 });
    setTimeout(() => router.back(), 200);
  }, []);

  const handleSave = useCallback(async () => {
    if (!url || !platform) {
      Alert.alert('Missing URL', 'Please enter a valid TikTok, Instagram, or YouTube URL.');
      return;
    }
    setSaving(true);
    try {
      const id = randomUUID();
      await createEntry({
        id, title: null, summary: null, category: null, tags: null,
        key_details: null, source_url: url, source_platform: platform,
        video_transcript: null, processing_status: 'pending',
        created_at: new Date().toISOString(),
        author_name: null, author_username: null, thumbnail_url: null,
        duration: null, view_count: null, like_count: null, published_at: null,
      });
      processEntry(id);

      triggerCollapse(() => {
        setSaving(false);
        setShowCheck(true);
        setTimeout(() => {
          backdropOpacity.value = withTiming(0, { duration: 280 });
          setTimeout(() => {
            router.back();
            if (isFromShare && platform) {
              Linking.openURL(PLATFORM_SCHEMES[platform]);
            }
          }, 280);
        }, 620);
      });
    } catch (err) {
      setSaving(false);
      Alert.alert('Error', 'Failed to save. Please try again.');
    }
  }, [url, platform]);

  const platformIcon = platform ? (PLATFORM_ICONS[platform] as any) : 'link-outline';
  const platformColor = platform ? (platformColors[platform] ?? colors.accent) : colors.textPlaceholder;

  const detectionStyle = useHeightReveal(!!platform && !saving, 40);
  const buttonStyle = useHeightReveal(!!platform && !saving, 56);

  return (
    <View style={styles.root}>
      {/* Backdrop */}
      <AnimatedPressable style={[styles.backdrop, backdropStyle]} onPress={dismiss} />

      {/* Ambient synapse orb */}
      <AmbientNode />

      {/* Checkmark flash */}
      <CheckmarkFlash visible={showCheck} />

      {/* Command bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'position' : undefined}
        keyboardVerticalOffset={0}
        style={styles.kvWrap}
      >
        <Animated.View style={[styles.card, collapseStyle]}>
          {/* Header row inside card */}
          <View style={styles.cardHeader}>
            {/* Dendrite-style left accent */}
            <View style={styles.cardHeaderLine} />
            <Text style={styles.cardLabel}>Add to knowledge base</Text>
          </View>

          {/* Input row */}
          <View style={styles.inputRow}>
            <View style={[styles.platformBadge, { backgroundColor: `${platformColor}28` }]}>
              <Ionicons name={platformIcon} size={18} color={platformColor} />
            </View>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Paste a video URL..."
              placeholderTextColor={colors.textPlaceholder}
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>

          {/* Platform detection strip */}
          <Animated.View style={[styles.detectionStrip, detectionStyle]}>
            <View style={[styles.detectionDot, { backgroundColor: platformColor }]} />
            <Text style={[styles.detectionText, { color: platformColor }]}>
              {platform ? PLATFORM_LABELS[platform] : ''}
            </Text>
            <Ionicons
              name="checkmark-circle"
              size={13}
              color={platformColor}
              style={{ marginLeft: 'auto', marginRight: 2 }}
            />
          </Animated.View>

          {/* Save button */}
          <Animated.View style={[styles.btnWrapper, buttonStyle]}>
            <Pressable
              style={[styles.saveBtn, saving && { opacity: 0.55 }]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={colors.text} size="small" />
              ) : (
                <>
                  <View style={styles.saveBtnDot} />
                  <Text style={styles.saveBtnText}>Save to Synapse</Text>
                </>
              )}
            </Pressable>
          </Animated.View>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'flex-start' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,8,6,0.78)' },

  // Ambient synapse orb
  ambientNode: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: colors.accent,
    top: '12%',
    alignSelf: 'center',
  },

  // Checkmark
  checkmark: {
    position: 'absolute',
    alignSelf: 'center',
    top: '35%',
    zIndex: 20,
  },

  // Card
  kvWrap: { width: SCREEN_WIDTH, alignItems: 'center', marginTop: 120 },
  card: {
    width: SCREEN_WIDTH - 32,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.55,
    shadowRadius: 36,
    elevation: 20,
  },

  // Card header (with dendrite line)
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 10,
  },
  cardHeaderLine: {
    width: 2,
    height: 14,
    borderRadius: 1,
    backgroundColor: colors.accent,
    opacity: 0.5,
  },
  cardLabel: {
    ...typography.label,
    color: colors.textTertiary,
  },

  // Input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: 12,
    gap: 12,
  },
  platformBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    paddingVertical: 6,
    fontWeight: '400',
  },

  // Detection strip
  detectionStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md + 48,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  detectionDot: { width: 6, height: 6, borderRadius: 3 },
  detectionText: { ...typography.mono, fontSize: 11 },

  // Save button
  btnWrapper: {
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    height: 56,
    gap: 10,
  },
  saveBtnDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  saveBtnText: { color: colors.text, fontSize: 15, fontWeight: '700', letterSpacing: -0.1 },
});
