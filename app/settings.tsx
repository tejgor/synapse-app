import React, { useState, useCallback, useRef } from 'react';
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
import Constants from 'expo-constants';
import { colors, spacing, borderRadius, typography } from '@/src/constants/theme';
import {
  getProcessingMode,
  setProcessingMode,
  getBackendTarget,
  setBackendTarget,
  getAutoCloudLongTranscripts,
  setAutoCloudLongTranscripts,
  type ProcessingMode,
  type BackendTarget,
} from '@/src/services/settings';
import { getBackendUrlPreview, hasDevBackendConfigured } from '@/src/services/backendConfig';
import { LOCAL_MODEL_INFO } from '@/src/services/modelManager';
import { useModelStatus } from '@/src/hooks/useModelStatus';
import {
  getLocalInferenceState,
  onLocalInferenceStateChange,
  pauseLocalInference,
  resumeLocalInference,
  type LocalInferenceState,
} from '@/src/services/processing';
import { LOCAL_CLOUD_FALLBACK_WORD_THRESHOLD } from '@/src/services/transcriptBudget';

const DEFAULT_LOCAL_INFERENCE_STATE: LocalInferenceState = {
  paused: false,
  running: false,
  stopping: false,
  currentEntryId: null,
  queuedEntryIds: [],
};

export default function SettingsScreen() {
  const [mode, setMode] = useState<ProcessingMode>('cloud');
  const [backendTarget, setBackendTargetState] = useState<BackendTarget>('prod');
  const { state: modelState, startDownload, cancel, remove, refresh } = useModelStatus();
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [localInferenceState, setLocalInferenceState] = useState<LocalInferenceState>(DEFAULT_LOCAL_INFERENCE_STATE);
  const [autoCloudLongTranscripts, setAutoCloudLongTranscriptsState] = useState(true);
  const [showDevOptions, setShowDevOptions] = useState(false);
  const [devSectionVisible, setDevSectionVisible] = useState(false);
  const devHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const devBackendConfigured = hasDevBackendConfigured();

  useFocusEffect(
    useCallback(() => {
      Promise.all([
        getProcessingMode(),
        getBackendTarget(),
        getLocalInferenceState(),
        getAutoCloudLongTranscripts(),
      ]).then(async ([storedMode, storedBackendTarget, inferenceState, storedAutoCloudLongTranscripts]) => {
        setMode(storedMode);
        setLocalInferenceState(inferenceState);
        setAutoCloudLongTranscriptsState(storedAutoCloudLongTranscripts);
        if (!devBackendConfigured && storedBackendTarget === 'dev') {
          setBackendTargetState('prod');
          await setBackendTarget('prod');
          return;
        }
        setBackendTargetState(storedBackendTarget);
      });
      refresh();

      return onLocalInferenceStateChange(setLocalInferenceState);
    }, [devBackendConfigured, refresh]),
  );

  const toggleMode = async (value: boolean) => {
    const newMode: ProcessingMode = value ? 'local' : 'cloud';
    if (newMode === 'local' && modelState !== 'ready') {
      Alert.alert(
        'Model required',
        `Download ${LOCAL_MODEL_INFO.name} (${LOCAL_MODEL_INFO.approxSizeLabel}) first to enable on-device processing.`,
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

  const toggleBackendTarget = async (value: boolean) => {
    if (value && !devBackendConfigured) {
      Alert.alert(
        'Development backend not configured',
        'Add EXPO_PUBLIC_DEV_API_URL to your root .env to enable runtime switching.',
      );
      return;
    }

    const nextTarget: BackendTarget = value ? 'dev' : 'prod';
    setBackendTargetState(nextTarget);
    await setBackendTarget(nextTarget);
  };

  const handlePauseLocalAI = async () => {
    await pauseLocalInference();
  };

  const handleResumeLocalAI = async () => {
    await resumeLocalInference();
  };

  const toggleAutoCloudLongTranscripts = async (value: boolean) => {
    setAutoCloudLongTranscriptsState(value);
    await setAutoCloudLongTranscripts(value);
  };

  const localQueueCount = localInferenceState.queuedEntryIds.length + (localInferenceState.currentEntryId ? 1 : 0);
  const localStatusText = localInferenceState.stopping
    ? 'Pausing current on-device extraction…'
    : localInferenceState.paused
      ? `Paused${localQueueCount > 0 ? ` • ${localQueueCount} item${localQueueCount === 1 ? '' : 's'} waiting` : ''}`
      : localInferenceState.running
        ? `Running${localQueueCount > 1 ? ` • ${localQueueCount - 1} queued next` : ''}`
        : localQueueCount > 0
          ? `Ready to resume • ${localQueueCount} queued`
          : 'Idle';

  const handleCancelDownload = async () => {
    await cancel();
  };

  const localQueueSummary = localInferenceState.currentEntryId
    ? `${localInferenceState.queuedEntryIds.length > 0 ? `${localInferenceState.queuedEntryIds.length} queued` : 'No queue'} · 1 active`
    : localInferenceState.queuedEntryIds.length > 0
      ? `${localInferenceState.queuedEntryIds.length} queued`
      : 'No queued items';

  const handleDelete = () => {
    Alert.alert(
      'Delete model',
      `This will remove the ${LOCAL_MODEL_INFO.approxSizeLabel} model file and switch back to cloud processing.`,
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
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>PROCESSING</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowTextBlock}>
              <Text style={styles.rowTitle}>On-device processing</Text>
              <Text style={styles.rowSubtitle}>
                {`Use ${LOCAL_MODEL_INFO.name} locally instead of cloud AI`}
              </Text>
            </View>
            <Switch
              value={mode === 'local'}
              onValueChange={toggleMode}
              trackColor={{ false: colors.border, true: colors.accent }}
              thumbColor={colors.text}
            />
          </View>

          <View style={styles.cardDivider} />

          <View style={styles.modelHeaderCompact}>
            <View style={styles.rowTextBlock}>
              <Text style={styles.rowTitle}>Model</Text>
              <Text style={styles.modelMetaCompact}>
                {LOCAL_MODEL_INFO.name}  ·  {LOCAL_MODEL_INFO.quant}  ·  {LOCAL_MODEL_INFO.approxSizeLabel}
              </Text>
              <Text style={styles.modelRecommendation}>
                {LOCAL_MODEL_INFO.recommendedDeviceLabel}
              </Text>
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
              <Text style={styles.inlineHint}>Recommended: use Wi-Fi for the initial download</Text>
            </>
          )}

          {modelState === 'downloading' && (
            <View style={styles.downloadRowCompact}>
              <View style={styles.downloadStatusCompact}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={styles.downloadingText}>Downloading {LOCAL_MODEL_INFO.approxSizeLabel}...</Text>
              </View>
              <Pressable style={styles.ghostButton} onPress={handleCancelDownload}>
                <Text style={styles.ghostButtonText}>Cancel</Text>
              </Pressable>
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

          {mode === 'local' && (
            <>
              <View style={styles.cardDivider} />
              <Text style={styles.inlineHint}>
                Transcript fetching still requires internet. Only the AI extraction runs on-device.
              </Text>

              <View style={styles.localControlCardCompact}>
                <View style={styles.compactHeaderRow}>
                  <Text style={styles.compactSectionTitle}>Local inference</Text>
                  <Text style={styles.localStatusBadge}>{localStatusText}</Text>
                </View>
                <Text style={styles.localQueueMeta}>{localQueueSummary}</Text>
                <View style={styles.localControlActionsCompact}>
                  <Pressable
                    style={[
                      styles.localControlButton,
                      styles.localPauseButton,
                      (localInferenceState.paused || (!localInferenceState.running && localInferenceState.queuedEntryIds.length === 0)) && styles.localControlButtonDisabled,
                    ]}
                    onPress={handlePauseLocalAI}
                    disabled={localInferenceState.paused || (!localInferenceState.running && localInferenceState.queuedEntryIds.length === 0)}
                  >
                    <Ionicons name="pause-outline" size={16} color={colors.text} />
                    <Text style={styles.localControlButtonText}>Pause</Text>
                  </Pressable>

                  <Pressable
                    style={[
                      styles.localControlButton,
                      styles.localResumeButton,
                      !localInferenceState.paused && styles.localControlButtonDisabled,
                    ]}
                    onPress={handleResumeLocalAI}
                    disabled={!localInferenceState.paused}
                  >
                    <Ionicons name="play-outline" size={16} color={colors.text} />
                    <Text style={styles.localControlButtonText}>Resume</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.localPolicyCardCompact}>
                <View style={styles.row}>
                  <View style={styles.rowTextBlock}>
                    <Text style={styles.compactSectionTitle}>Long transcript fallback</Text>
                    <Text style={styles.compactSubtitle}>
                      {`${LOCAL_CLOUD_FALLBACK_WORD_THRESHOLD.toLocaleString()}+ words → use cloud automatically`}
                    </Text>
                  </View>
                  <Switch
                    value={autoCloudLongTranscripts}
                    onValueChange={toggleAutoCloudLongTranscripts}
                    trackColor={{ false: colors.border, true: colors.accent }}
                    thumbColor={colors.text}
                  />
                </View>
              </View>
            </>
          )}
        </View>
      </View>

      {devSectionVisible && (
        <View style={styles.section}>
          <Pressable style={styles.devToggle} onPress={() => setShowDevOptions((value) => !value)}>
            <View>
              <Text style={styles.devToggleLabel}>Developer</Text>
              <Text style={styles.devToggleSubtitle}>
                {backendTarget === 'dev' ? 'Development backend active' : 'Production backend active'}
              </Text>
            </View>
            <Ionicons
              name={showDevOptions ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.textPlaceholder}
            />
          </Pressable>

          {showDevOptions && (
            <View style={styles.devCard}>
              <View style={styles.row}>
                <View style={styles.rowTextBlock}>
                  <Text style={styles.rowTitle}>Use development backend</Text>
                  <Text style={styles.rowSubtitle}>
                    Switch future requests between production and your local/dev API.
                  </Text>
                </View>
                <Switch
                  value={backendTarget === 'dev'}
                  onValueChange={toggleBackendTarget}
                  disabled={!devBackendConfigured}
                  trackColor={{ false: colors.border, true: colors.accent }}
                  thumbColor={colors.text}
                />
              </View>

              <View style={styles.backendMetaBlock}>
                <Text style={styles.backendBadge}>{backendTarget === 'dev' ? 'Development' : 'Production'}</Text>
                <Text style={styles.backendUrl}>{getBackendUrlPreview(backendTarget)}</Text>
                {!devBackendConfigured && (
                  <Text style={styles.warningText}>
                    Add EXPO_PUBLIC_DEV_API_URL to .env to enable this switch.
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>
      )}

      <Pressable
        style={styles.versionFooter}
        onPressIn={() => {
          devHoldTimer.current = setTimeout(() => setDevSectionVisible(true), 5000);
        }}
        onPressOut={() => {
          if (devHoldTimer.current) {
            clearTimeout(devHoldTimer.current);
            devHoldTimer.current = null;
          }
        }}
      >
        <Text style={styles.versionText}>v{Constants.expoConfig?.version ?? '1.0.0'}</Text>
      </Pressable>
    </ScrollView>
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

  cardDivider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginVertical: spacing.md,
  },
  inlineHint: {
    color: colors.textPlaceholder,
    fontSize: 12,
    lineHeight: 17,
  },

  modelHeaderCompact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  modelMetaCompact: {
    ...typography.mono,
    color: colors.textTertiary,
    marginTop: 4,
    fontSize: 11,
  },
  modelRecommendation: {
    color: colors.textPlaceholder,
    fontSize: 11,
    marginTop: 3,
  },
  downloadRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  downloadStatusCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  ghostButton: {
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ghostButtonText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },

  localControlCardCompact: {
    marginTop: spacing.md,
    backgroundColor: colors.surfaceRaised,
    borderRadius: borderRadius.sm,
    padding: spacing.sm + 2,
    gap: spacing.sm,
  },
  localPolicyCardCompact: {
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderRadius: borderRadius.sm,
    padding: spacing.sm + 2,
  },
  compactHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  compactSectionTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  compactSubtitle: {
    color: colors.textTertiary,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 17,
  },
  localStatusBadge: {
    alignSelf: 'flex-start',
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: colors.background,
    borderRadius: borderRadius.xs,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  localQueueMeta: {
    ...typography.mono,
    color: colors.textSecondary,
    fontSize: 11,
  },
  localControlActionsCompact: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  localControlButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: borderRadius.sm,
    paddingVertical: 9,
  },
  localPauseButton: {
    backgroundColor: colors.borderSubtle,
  },
  localResumeButton: {
    backgroundColor: colors.accent,
  },
  localControlButtonDisabled: {
    opacity: 0.5,
  },
  localControlButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },

  backendMetaBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    gap: spacing.xs,
  },
  backendBadge: {
    alignSelf: 'flex-start',
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
    backgroundColor: colors.surfaceRaised,
    borderRadius: borderRadius.xs,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  backendUrl: {
    ...typography.mono,
    color: colors.textSecondary,
  },

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
    marginTop: spacing.md,
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
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: borderRadius.sm,
    paddingVertical: 10,
  },
  deleteBtnText: { color: colors.error, fontSize: 14, fontWeight: '500' },

  errorText: { color: colors.error, fontSize: 13, marginTop: spacing.sm },
  warningText: { color: colors.warning, fontSize: 12, marginTop: spacing.xs },

  devToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  devToggleLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  devToggleSubtitle: {
    color: colors.textPlaceholder,
    fontSize: 11,
    marginTop: 2,
  },
  devCard: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },

  versionFooter: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    marginTop: spacing.sm,
  },
  versionText: {
    color: colors.textPlaceholder,
    fontSize: 11,
  },
});
