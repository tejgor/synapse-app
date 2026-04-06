import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  Pressable,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { colors, spacing, borderRadius, typography } from '@/src/constants/theme';
import { getProcessingMode, setProcessingMode, type ProcessingMode } from '@/src/services/settings';
import { useModelStatus } from '@/src/hooks/useModelStatus';

export default function SettingsScreen() {
  const [mode, setMode] = useState<ProcessingMode>('cloud');
  const { state: modelState, startDownload, cancel, remove, refresh } = useModelStatus();
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      getProcessingMode().then(setMode);
      refresh();
    }, [refresh]),
  );

  const toggleMode = async (value: boolean) => {
    const newMode: ProcessingMode = value ? 'local' : 'cloud';
    if (newMode === 'local' && modelState !== 'ready') {
      Alert.alert(
        'Model required',
        'Download the Gemma 4 model (~3 GB) first to enable on-device processing.',
      );
      return;
    }
    setMode(newMode);
    await setProcessingMode(newMode);
  };

  const handleDownload = async () => {
    setDownloadError(null);
    try {
      await startDownload();
    } catch (err: any) {
      setDownloadError(err?.message || 'Download failed');
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete model',
      'This will remove the 3 GB model file and switch back to cloud processing.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (mode === 'local') {
              setMode('cloud');
              await setProcessingMode('cloud');
            }
            await remove();
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Processing Mode */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>PROCESSING</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowTextBlock}>
              <Text style={styles.rowTitle}>On-device processing</Text>
              <Text style={styles.rowSubtitle}>
                Use Gemma 4 to extract knowledge locally instead of cloud AI
              </Text>
            </View>
            <Switch
              value={mode === 'local'}
              onValueChange={toggleMode}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor={colors.text}
            />
          </View>
        </View>
        {mode === 'local' && (
          <Text style={styles.hint}>
            Transcript fetching still requires internet. Only AI extraction runs on-device.
          </Text>
        )}
      </View>

      {/* Model Management */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>MODEL</Text>
        <View style={styles.card}>
          <View style={styles.modelHeader}>
            <View>
              <Text style={styles.rowTitle}>Gemma 4 E2B</Text>
              <Text style={styles.modelMeta}>2.3B params  |  Q4_K_M  |  ~3 GB</Text>
            </View>
            {modelState === 'ready' && (
              <View style={styles.readyBadge}>
                <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                <Text style={styles.readyText}>Ready</Text>
              </View>
            )}
          </View>

          {modelState === 'none' && (
            <>
              <Pressable style={styles.downloadBtn} onPress={handleDownload}>
                <Ionicons name="cloud-download-outline" size={18} color={colors.text} />
                <Text style={styles.downloadBtnText}>Download model</Text>
              </Pressable>
              <Text style={styles.hint}>Recommended: connect to Wi-Fi before downloading</Text>
            </>
          )}

          {modelState === 'downloading' && (
            <View style={styles.downloadingSection}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.downloadingText}>Downloading ~3 GB...</Text>
            </View>
          )}

          {modelState === 'ready' && (
            <Pressable style={styles.deleteBtn} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={16} color={colors.error} />
              <Text style={styles.deleteBtnText}>Delete model</Text>
            </Pressable>
          )}

          {downloadError && (
            <Text style={styles.errorText}>{downloadError}</Text>
          )}
        </View>
      </View>

      {/* Info */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>ABOUT ON-DEVICE AI</Text>
        <View style={styles.card}>
          <InfoRow icon="hardware-chip-outline" text="Requires iPhone 14+ (6 GB RAM)" />
          <InfoRow icon="flash-outline" text="~30 tokens/sec on iPhone 16 Pro" />
          <InfoRow icon="lock-closed-outline" text="Fully private — data stays on device" />
          <InfoRow icon="alert-circle-outline" text="Quality may differ from cloud processing" />
        </View>
      </View>
    </ScrollView>
  );
}

function InfoRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon as any} size={16} color={colors.textTertiary} />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },

  section: { marginBottom: spacing.lg },
  sectionLabel: {
    ...typography.label,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowTextBlock: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  rowSubtitle: { color: colors.textTertiary, fontSize: 13, marginTop: 2, lineHeight: 18 },

  hint: {
    color: colors.textPlaceholder,
    fontSize: 12,
    marginTop: spacing.sm,
    marginLeft: spacing.xs,
  },

  modelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  modelMeta: { ...typography.mono, color: colors.textTertiary, marginTop: 4 },

  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.successSubtle,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.xs,
  },
  readyText: { color: colors.success, fontSize: 12, fontWeight: '600' },

  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: borderRadius.sm,
    paddingVertical: 12,
  },
  downloadBtnText: { color: colors.text, fontSize: 15, fontWeight: '600' },

  downloadingSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  downloadingText: { color: colors.textSecondary, fontSize: 14 },

  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: borderRadius.sm,
    paddingVertical: 10,
  },
  deleteBtnText: { color: colors.error, fontSize: 14, fontWeight: '500' },

  errorText: { color: colors.error, fontSize: 13, marginTop: spacing.sm },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  infoText: { color: colors.textSecondary, fontSize: 13, flex: 1, lineHeight: 18 },
});
