import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Linking,
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolate,
} from 'react-native-reanimated';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  colors, spacing, borderRadius, shadows, typography, animation, categoryColor, categoryTint,
} from '@/src/constants/theme';
import { getEntryById, updateEntry, deleteEntry, renameCategory } from '@/src/db/entries';
import {
  notifyUpdate,
  onProcessingUpdate,
  onLocalInferenceStateChange,
  getLocalInferenceState,
  prioritizeLocalInference,
  processEntry,
  reprocessEntry,
  type LocalInferenceState,
} from '@/src/services/processing';
import { getProcessingMode } from '@/src/services/settings';
import type { Entry, KeyDetail, ContentSection, ContentItem } from '@/src/types';
import { usePressAnimation } from '@/src/utils/animations';
import { useCrystallize } from '@/src/utils/useCrystallize';
import { getProcessingLabel } from '@/src/utils/processingLabel';
import { SynapsePulse } from '@/src/components/SynapsePulse';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
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

type SectionItemInteraction = (itemIndex: number, field: 'text' | 'label') => void;

function ExpandableFieldPressable({
  children,
  onPress,
  onLongPress,
  style,
  disabled,
  hitSlop,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: any;
  disabled?: boolean;
  hitSlop?: number;
}) {
  const longPressTriggeredRef = React.useRef(false);

  return (
    <Pressable
      style={style}
      hitSlop={hitSlop}
      delayLongPress={250}
      disabled={disabled || (!onPress && !onLongPress)}
      accessibilityRole={onPress || onLongPress ? 'button' : undefined}
      accessibilityHint={onPress && onLongPress ? 'Tap to expand. Long press to edit.' : undefined}
      onLongPress={() => {
        longPressTriggeredRef.current = true;
        onLongPress?.();
      }}
      onPress={() => {
        if (longPressTriggeredRef.current) return;
        onPress?.();
      }}
      onPressOut={() => {
        if (!longPressTriggeredRef.current) return;
        setTimeout(() => {
          longPressTriggeredRef.current = false;
        }, 100);
      }}
    >
      {children}
    </Pressable>
  );
}

function InsightCard({
  label,
  value,
  delay,
  catColor,
  onViewText,
  onViewLabel,
  onEditText,
  onEditLabel,
}: {
  label: string;
  value: string;
  delay: number;
  catColor: string;
  onViewText?: () => void;
  onViewLabel?: () => void;
  onEditText?: () => void;
  onEditLabel?: () => void;
}) {
  const crystalStyle = useCrystallize({ delay, seed: delay });
  const isUrl = value.startsWith('http://') || value.startsWith('https://');

  return (
    <Animated.View style={[styles.insightCard, crystalStyle]}>
      {/* Category-colored top accent — 4px, full opacity */}
      <View style={[styles.insightAccent, { backgroundColor: catColor }]} />
      <ExpandableFieldPressable onPress={onViewLabel} onLongPress={onEditLabel}>
        <Text style={styles.insightLabel}>{label}</Text>
      </ExpandableFieldPressable>
      <ExpandableFieldPressable onPress={onViewText} onLongPress={onEditText}>
        <Text style={isUrl ? styles.insightLink : styles.insightValue} numberOfLines={isUrl ? 2 : 3}>{value}</Text>
      </ExpandableFieldPressable>
    </Animated.View>
  );
}

// ─── Content type icon mapping ────────────────────────────────────────────────

const CONTENT_TYPE_ICONS: Record<string, string> = {
  tutorial: 'school-outline',
  walkthrough: 'school-outline',
  demo: 'school-outline',
  review: 'star-half-outline',
  comparison: 'git-compare-outline',
  'quick tip': 'flash-outline',
  tip: 'flash-outline',
  recipe: 'restaurant-outline',
  explainer: 'bulb-outline',
  'resource list': 'list-outline',
  opinion: 'chatbubble-outline',
  news: 'newspaper-outline',
  story: 'book-outline',
};

function getContentTypeIcon(contentType: string): string {
  const key = contentType.toLowerCase();
  return CONTENT_TYPE_ICONS[key] || 'document-text-outline';
}

// ─── Section renderers ───────────────────────────────────────────────────────

function OrderedItem({ item, index, total, catColor, delay, onViewText, onEditText }: {
  item: ContentItem;
  index: number;
  total: number;
  catColor: string;
  delay: number;
  onViewText?: () => void;
  onEditText?: () => void;
}) {
  const crystalStyle = useCrystallize({ delay, seed: delay });
  return (
    <Animated.View style={[styles.orderedItem, crystalStyle]}>
      <View style={styles.stepConnector}>
        <View style={[styles.stepCircle, { backgroundColor: catColor }]}>
          <Text style={styles.stepNumber}>{index + 1}</Text>
        </View>
        {index < total - 1 && <View style={[styles.stepLine, { backgroundColor: `${catColor}33` }]} />}
      </View>
      <ExpandableFieldPressable onPress={onViewText} onLongPress={onEditText} style={{ flex: 1 }}>
        <Text style={styles.orderedText}>{item.text}</Text>
      </ExpandableFieldPressable>
    </Animated.View>
  );
}

function OrderedSection({ items, catColor, baseDelay, onViewItem, onEditItem }: {
  items: ContentItem[];
  catColor: string;
  baseDelay: number;
  onViewItem?: SectionItemInteraction;
  onEditItem?: SectionItemInteraction;
}) {
  return (
    <View style={styles.orderedSection}>
      {items.map((item, i) => (
        <OrderedItem
          key={i}
          item={item}
          index={i}
          total={items.length}
          catColor={catColor}
          delay={baseDelay + i * 50}
          onViewText={onViewItem ? () => onViewItem(i, 'text') : undefined}
          onEditText={onEditItem ? () => onEditItem(i, 'text') : undefined}
        />
      ))}
    </View>
  );
}

function UnorderedItem({ item, catColor, delay, onViewText, onEditText }: {
  item: ContentItem;
  catColor: string;
  delay: number;
  onViewText?: () => void;
  onEditText?: () => void;
}) {
  const crystalStyle = useCrystallize({ delay, seed: delay });
  return (
    <Animated.View style={[styles.unorderedItem, crystalStyle]}>
      <View style={[styles.bulletDot, { backgroundColor: catColor }]} />
      <ExpandableFieldPressable onPress={onViewText} onLongPress={onEditText} style={{ flex: 1 }}>
        <Text style={styles.unorderedText}>{item.text}</Text>
      </ExpandableFieldPressable>
    </Animated.View>
  );
}

function UnorderedSection({ items, catColor, baseDelay, onViewItem, onEditItem }: {
  items: ContentItem[];
  catColor: string;
  baseDelay: number;
  onViewItem?: SectionItemInteraction;
  onEditItem?: SectionItemInteraction;
}) {
  return (
    <View style={styles.unorderedSection}>
      {items.map((item, i) => (
        <UnorderedItem
          key={i}
          item={item}
          catColor={catColor}
          delay={baseDelay + i * 40}
          onViewText={onViewItem ? () => onViewItem(i, 'text') : undefined}
          onEditText={onEditItem ? () => onEditItem(i, 'text') : undefined}
        />
      ))}
    </View>
  );
}

function KeyValueSection({ items, catColor, baseDelay, onViewItem, onEditItem }: {
  items: ContentItem[];
  catColor: string;
  baseDelay: number;
  onViewItem?: SectionItemInteraction;
  onEditItem?: SectionItemInteraction;
}) {
  return (
    <View style={styles.insightGrid}>
      {items.map((item, i) => (
        <InsightCard
          key={i}
          label={item.label || ''}
          value={item.text}
          catColor={catColor}
          delay={baseDelay + i * 60}
          onViewText={onViewItem ? () => onViewItem(i, 'text') : undefined}
          onViewLabel={onViewItem ? () => onViewItem(i, 'label') : undefined}
          onEditText={onEditItem ? () => onEditItem(i, 'text') : undefined}
          onEditLabel={onEditItem ? () => onEditItem(i, 'label') : undefined}
        />
      ))}
    </View>
  );
}

function SingleSection({ items, catColor, baseDelay, onViewItem, onEditItem }: {
  items: ContentItem[];
  catColor: string;
  baseDelay: number;
  onViewItem?: SectionItemInteraction;
  onEditItem?: SectionItemInteraction;
}) {
  const text = items.map((item) => item.text).join('\n\n');
  const crystalStyle = useCrystallize({ delay: baseDelay, seed: baseDelay });
  return (
    <ExpandableFieldPressable
      onPress={onViewItem ? () => onViewItem(0, 'text') : undefined}
      onLongPress={onEditItem ? () => onEditItem(0, 'text') : undefined}
    >
      <Animated.View style={[styles.singleBlock, { backgroundColor: `${catColor}14` }, crystalStyle]}>
        <View style={[styles.singleBar, { backgroundColor: catColor }]} />
        <Text style={styles.singleText}>{text}</Text>
      </Animated.View>
    </ExpandableFieldPressable>
  );
}

function SectionBlock({ section, catColor, baseDelay, onViewItem, onEditItem }: {
  section: ContentSection;
  catColor: string;
  baseDelay: number;
  onViewItem?: SectionItemInteraction;
  onEditItem?: SectionItemInteraction;
}) {
  const crystalStyle = useCrystallize({ delay: baseDelay, seed: baseDelay });
  return (
    <Animated.View style={crystalStyle}>
      <Text style={styles.sectionLabel}>{section.heading}</Text>
      {section.style === 'ordered' && (
        <OrderedSection items={section.items} catColor={catColor} baseDelay={baseDelay + 20} onViewItem={onViewItem} onEditItem={onEditItem} />
      )}
      {section.style === 'unordered' && (
        <UnorderedSection items={section.items} catColor={catColor} baseDelay={baseDelay + 20} onViewItem={onViewItem} onEditItem={onEditItem} />
      )}
      {section.style === 'key-value' && (
        <KeyValueSection items={section.items} catColor={catColor} baseDelay={baseDelay + 20} onViewItem={onViewItem} onEditItem={onEditItem} />
      )}
      {section.style === 'single' && (
        <SingleSection items={section.items} catColor={catColor} baseDelay={baseDelay + 20} onViewItem={onViewItem} onEditItem={onEditItem} />
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

const DEFAULT_LOCAL_INFERENCE_STATE: LocalInferenceState = {
  paused: false,
  running: false,
  stopping: false,
  currentEntryId: null,
  queuedEntryIds: [],
};

type EditorSheetConfig = {
  title: string;
  description?: string;
  initialValue: string;
  placeholder?: string;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  allowEmpty?: boolean;
  saveLabel?: string;
  onSave: (value: string) => Promise<boolean | void> | boolean | void;
};

type ViewSheetConfig = {
  title: string;
  value: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

function EditSheet({
  config,
  visible,
  value,
  saving,
  onChangeText,
  onCancel,
  onSave,
}: {
  config: EditorSheetConfig | null;
  visible: boolean;
  value: string;
  saving: boolean;
  onChangeText: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  if (!config) return null;

  const saveDisabled = saving || (!config.allowEmpty && !value.trim());

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.editorRoot}
      >
        <Pressable style={styles.editorBackdrop} onPress={saving ? undefined : onCancel} />
        <View style={styles.editorCard}>
          <View style={styles.editorHandle} />
          <Text style={styles.editorTitle}>{config.title}</Text>
          {config.description ? (
            <Text style={styles.editorDescription}>{config.description}</Text>
          ) : null}

          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={config.placeholder}
            placeholderTextColor={colors.textPlaceholder}
            autoFocus
            multiline={config.multiline}
            autoCapitalize={config.autoCapitalize ?? 'sentences'}
            autoCorrect={config.autoCorrect ?? false}
            textAlignVertical={config.multiline ? 'top' : 'center'}
            selectionColor={colors.accent}
            style={[
              styles.editorInput,
              config.multiline ? styles.editorInputMultiline : styles.editorInputSingle,
            ]}
          />

          <View style={styles.editorActions}>
            <Pressable
              style={styles.editorSecondaryButton}
              onPress={onCancel}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Cancel editing"
            >
              <Text style={styles.editorSecondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.editorPrimaryButton, saveDisabled && styles.editorPrimaryButtonDisabled]}
              onPress={onSave}
              disabled={saveDisabled}
              accessibilityRole="button"
              accessibilityLabel={config.saveLabel || 'Save changes'}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <Text style={styles.editorPrimaryButtonText}>{config.saveLabel || 'Save'}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ViewSheet({
  config,
  visible,
  onClose,
}: {
  config: ViewSheetConfig | null;
  visible: boolean;
  onClose: () => void;
}) {
  if (!config) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.viewerRoot}>
        <Pressable style={styles.viewerBackdrop} onPress={onClose} />
        <View style={styles.viewerCard}>
          <View style={styles.editorHandle} />
          <Text style={styles.editorTitle}>{config.title}</Text>
          {config.description ? (
            <Text style={styles.editorDescription}>{config.description}</Text>
          ) : null}

          <ScrollView
            style={styles.viewerScroll}
            contentContainerStyle={styles.viewerScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.viewerText}>{config.value}</Text>
          </ScrollView>

          <View style={styles.editorActions}>
            {config.onAction ? (
              <Pressable
                style={styles.editorSecondaryButton}
                onPress={config.onAction}
                accessibilityRole="button"
                accessibilityLabel={config.actionLabel || 'Open link'}
              >
                <Text style={styles.editorSecondaryButtonText}>{config.actionLabel || 'Open link'}</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={styles.editorPrimaryButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <Text style={styles.editorPrimaryButtonText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingMode, setProcessingMode] = useState<'cloud' | 'local'>('cloud');
  const [localInferenceState, setLocalInferenceState] = useState<LocalInferenceState>(DEFAULT_LOCAL_INFERENCE_STATE);
  const [editorConfig, setEditorConfig] = useState<EditorSheetConfig | null>(null);
  const [editorValue, setEditorValue] = useState('');
  const [editorSaving, setEditorSaving] = useState(false);
  const [viewerConfig, setViewerConfig] = useState<ViewSheetConfig | null>(null);

  const reload = useCallback(() => {
    if (!id) return;
    getEntryById(id).then(setEntry);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    getEntryById(id).then(setEntry).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => onProcessingUpdate(reload), [reload]);

  useEffect(() => {
    getProcessingMode().then(setProcessingMode).catch(() => {});
    getLocalInferenceState().then(setLocalInferenceState).catch(() => {});
    return onLocalInferenceStateChange(setLocalInferenceState);
  }, []);

  const closeViewer = useCallback(() => {
    setViewerConfig(null);
  }, []);

  const openViewer = useCallback((config: ViewSheetConfig) => {
    setViewerConfig(config);
  }, []);

  const closeEditor = useCallback(() => {
    if (editorSaving) return;
    setEditorConfig(null);
    setEditorValue('');
  }, [editorSaving]);

  const openEditor = useCallback((config: EditorSheetConfig) => {
    setViewerConfig(null);
    setEditorConfig(config);
    setEditorValue(config.initialValue);
  }, []);

  const handleEditorSave = useCallback(async () => {
    if (!editorConfig || editorSaving) return;

    setEditorSaving(true);
    try {
      const shouldClose = await editorConfig.onSave(editorValue);
      if (shouldClose !== false) {
        setEditorConfig(null);
        setEditorValue('');
      }
    } finally {
      setEditorSaving(false);
    }
  }, [editorConfig, editorSaving, editorValue]);

  const openValueViewer = useCallback((title: string, value: string, description?: string) => {
    const isUrl = value.startsWith('http://') || value.startsWith('https://');
    openViewer({
      title,
      value,
      description,
      actionLabel: isUrl ? 'Open link' : undefined,
      onAction: isUrl ? () => {
        closeViewer();
        Linking.openURL(value);
      } : undefined,
    });
  }, [closeViewer, openViewer]);

  const handleEditCategory = useCallback(() => {
    if (!entry?.category || !id) return;
    const oldCategory = entry.category;

    openEditor({
      title: 'Edit Category',
      description: 'Choose the new category name. You can apply it to just this entry or every matching entry next.',
      initialValue: oldCategory,
      placeholder: 'Category',
      autoCapitalize: 'words',
      saveLabel: 'Continue',
      onSave: (newCategory) => {
        const trimmed = newCategory.trim();
        if (!trimmed || trimmed === oldCategory) return true;

        Alert.alert(
          'Apply to...',
          `Rename "${oldCategory}" to "${trimmed}"`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Just this entry',
              onPress: async () => {
                await updateEntry(id, { category: trimmed });
                reload();
                notifyUpdate();
              },
            },
            {
              text: `All "${oldCategory}" entries`,
              onPress: async () => {
                await renameCategory(oldCategory, trimmed);
                reload();
                notifyUpdate();
              },
            },
          ],
        );

        return true;
      },
    });
  }, [entry?.category, id, openEditor, reload]);

  const handleRetry = useCallback(async () => {
    if (!id) return;
    await updateEntry(id, { processing_status: 'pending' });
    reload();
    processEntry(id);
  }, [id, reload]);

  const handleProcessNext = useCallback(async () => {
    if (!id) return;
    await prioritizeLocalInference(id);
  }, [id]);

  const handleRemove = useCallback(() => {
    if (!id) return;
    Alert.alert('Remove entry', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteEntry(id);
          notifyUpdate();
          router.back();
        },
      },
    ]);
  }, [id]);

  const handleReprocess = useCallback(() => {
    if (!id) return;
    Alert.alert(
      'Redo analysis',
      'Re-run AI extraction using the existing transcript.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Cloud',
          onPress: () => {
            reprocessEntry(id, 'cloud');
            reload();
          },
        },
        {
          text: 'On-device',
          onPress: () => {
            reprocessEntry(id, 'local');
            reload();
          },
        },
      ],
    );
  }, [id, reload]);

  const handleEditTitle = useCallback(() => {
    if (!id || !entry?.title) return;

    openEditor({
      title: 'Edit Title',
      description: 'Refine the title without losing the full context.',
      initialValue: entry.title,
      placeholder: 'Title',
      autoCapitalize: 'sentences',
      onSave: async (value) => {
        const trimmed = value.trim();
        if (!trimmed || trimmed === entry.title) return true;
        await updateEntry(id, { title: trimmed });
        reload();
        notifyUpdate();
        return true;
      },
    });
  }, [id, entry?.title, openEditor, reload]);

  const handleEditSummary = useCallback(() => {
    if (!id || !entry?.summary) return;

    openEditor({
      title: 'Edit Summary',
      description: 'Make edits in a larger text area so longer summaries are easier to review.',
      initialValue: entry.summary,
      placeholder: 'Summary',
      multiline: true,
      autoCapitalize: 'sentences',
      onSave: async (value) => {
        const trimmed = value.trim();
        if (!trimmed || trimmed === entry.summary) return true;
        await updateEntry(id, { summary: trimmed });
        reload();
        notifyUpdate();
        return true;
      },
    });
  }, [id, entry?.summary, openEditor, reload]);

  const handleEditTags = useCallback(() => {
    if (!id) return;
    const currentTags: string[] = entry?.tags ? JSON.parse(entry.tags) : [];

    openEditor({
      title: 'Edit Tags',
      description: 'Use commas between tags. Leave blank to clear them all.',
      initialValue: currentTags.join(', '),
      placeholder: 'productivity, notes, ai',
      multiline: true,
      autoCapitalize: 'none',
      autoCorrect: false,
      allowEmpty: true,
      onSave: async (value) => {
        const parsed = value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
        await updateEntry(id, { tags: JSON.stringify(parsed) });
        reload();
        notifyUpdate();
        return true;
      },
    });
  }, [id, entry?.tags, openEditor, reload]);

  const handleEditContentType = useCallback(() => {
    if (!id || !entry?.content_type) return;

    openEditor({
      title: 'Edit Content Type',
      description: 'Name the kind of content this entry represents.',
      initialValue: entry.content_type,
      placeholder: 'Content type',
      autoCapitalize: 'words',
      onSave: async (value) => {
        const trimmed = value.trim();
        if (!trimmed || trimmed === entry.content_type) return true;
        await updateEntry(id, { content_type: trimmed });
        reload();
        notifyUpdate();
        return true;
      },
    });
  }, [id, entry?.content_type, openEditor, reload]);

  const handleEditSectionItem = useCallback((sectionIndex: number, itemIndex: number, field: 'text' | 'label') => {
    if (!id || !entry?.key_details) return;
    const currentSections: ContentSection[] = JSON.parse(entry.key_details);
    const item = currentSections[sectionIndex]?.items[itemIndex];
    if (!item) return;
    const currentValue = field === 'label' ? (item.label || '') : item.text;

    openEditor({
      title: field === 'label' ? 'Edit Label' : 'Edit Text',
      description: field === 'label'
        ? 'Keep labels short and scannable.'
        : 'Edit the full text in a larger editor.',
      initialValue: currentValue,
      placeholder: field === 'label' ? 'Label' : 'Text',
      multiline: field === 'text',
      autoCapitalize: field === 'label' ? 'words' : 'sentences',
      onSave: async (value) => {
        const trimmed = value.trim();
        if (!trimmed || trimmed === currentValue) return true;
        if (field === 'label') {
          currentSections[sectionIndex].items[itemIndex].label = trimmed;
        } else {
          currentSections[sectionIndex].items[itemIndex].text = trimmed;
        }
        await updateEntry(id, { key_details: JSON.stringify(currentSections) });
        reload();
        notifyUpdate();
        return true;
      },
    });
  }, [id, entry?.key_details, openEditor, reload]);

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
  const isLegacy = !entry.content_type;
  const keyDetails: KeyDetail[] = isLegacy && entry.key_details ? JSON.parse(entry.key_details) : [];
  const sections: ContentSection[] = !isLegacy && entry.key_details ? JSON.parse(entry.key_details) : [];
  const catColor = entry.category ? categoryColor(entry.category) : colors.accent;
  const isProcessing =
    entry.processing_status === 'processing' || entry.processing_status === 'pending';
  const processingLabel = getProcessingLabel(entry);
  const isLocalMode = processingMode === 'local';
  const isCurrentLocalEntry = localInferenceState.currentEntryId === entry.id;
  const isQueuedLocalEntry = localInferenceState.queuedEntryIds.includes(entry.id);
  const canPrioritizeLocalEntry = isLocalMode
    && !!entry.video_transcript
    && isProcessing
    && !isCurrentLocalEntry;
  const processNextLabel = localInferenceState.paused
    ? 'Resume and process this next'
    : localInferenceState.currentEntryId && localInferenceState.currentEntryId !== entry.id
      ? 'Pause current and process this next'
      : isQueuedLocalEntry
        ? 'Move to front'
        : 'Process this next';

  const isCompleted = entry.processing_status === 'completed';
  const canRedoAnalysis = isCompleted && !!entry.video_transcript;

  const date = new Date(entry.created_at).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <View style={styles.outer}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Category pill + Content type badge ── */}
        {(entry.category || entry.content_type || canRedoAnalysis) && (
          <Animated.View style={[styles.catRow, dateCrystal]}>
            <View style={styles.catMetaGroup}>
              {entry.category && (
                <ExpandableFieldPressable
                  onPress={() => openValueViewer('Category', entry.category || '')}
                  onLongPress={handleEditCategory}
                  hitSlop={6}
                >
                  <View style={[styles.catPill, { backgroundColor: `${catColor}22` }]}>
                    <View style={[styles.catDot, { backgroundColor: catColor }]} />
                    <Text style={[styles.catLabel, { color: catColor }]}>{entry.category}</Text>
                    <Ionicons name="pencil" size={10} color={`${catColor}88`} />
                  </View>
                </ExpandableFieldPressable>
              )}
              {entry.content_type && (
                <ExpandableFieldPressable
                  onPress={() => openValueViewer('Content Type', entry.content_type || '')}
                  onLongPress={isCompleted ? handleEditContentType : undefined}
                  style={styles.typeBadge}
                >
                  <Ionicons name={getContentTypeIcon(entry.content_type) as any} size={12} color={colors.textTertiary} />
                  <Text style={styles.typeLabel}>{entry.content_type}</Text>
                </ExpandableFieldPressable>
              )}
            </View>
            {canRedoAnalysis && (
              <Pressable
                onPress={handleReprocess}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Redo analysis"
                style={styles.headerRedoButton}
              >
                <Ionicons name="refresh-outline" size={15} color={colors.textSecondary} />
                <Text style={styles.headerRedoButtonText}>Redo</Text>
              </Pressable>
            )}
          </Animated.View>
        )}

        {/* ── Title — biggest element, crystallizes first ── */}
        {(entry.title || entry.processing_status === 'failed') && (
          <ExpandableFieldPressable
            onPress={entry.title ? () => openValueViewer('Title', entry.title || '') : undefined}
            onLongPress={isCompleted ? handleEditTitle : undefined}
          >
            <Animated.Text style={[styles.title, titleCrystal]}>
              {entry.title || (entry.source_platform === 'tiktok' ? 'TikTok Video' : entry.source_platform === 'instagram' ? 'Instagram Reel' : 'YouTube Video')}
            </Animated.Text>
          </ExpandableFieldPressable>
        )}

        {/* ── Date in SpaceMono ── */}
        <Animated.Text style={[styles.date, dateCrystal]}>
          {entry.published_at
            ? `published ${new Date(entry.published_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · saved ${date}`
            : `saved ${date}`}
        </Animated.Text>

        {/* ── Source URL link for failed entries ── */}
        {entry.processing_status === 'failed' && (
          <Pressable onPress={() => Linking.openURL(entry.source_url)}>
            <Text style={styles.failedSourceLink} numberOfLines={2}>{entry.source_url}</Text>
          </Pressable>
        )}

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
          <ExpandableFieldPressable
            onPress={() => openValueViewer('Summary', entry.summary || '')}
            onLongPress={isCompleted ? handleEditSummary : undefined}
          >
            <Animated.View style={[styles.pullQuote, { backgroundColor: categoryTint(entry.category || '') }, quoteCrystal]}>
              <View style={[styles.pullBar, { backgroundColor: catColor }]} />
              <Text style={styles.pullText}>{entry.summary}</Text>
            </Animated.View>
          </ExpandableFieldPressable>
        )}

        {/* ── Tags ── */}
        {tags.length > 0 && (
          <ExpandableFieldPressable
            onPress={() => openValueViewer('Tags', tags.join(', '))}
            onLongPress={isCompleted ? handleEditTags : undefined}
          >
            <Animated.View style={[styles.tagsRow, tagsCrystal]}>
              {tags.map((tag) => (
                <View key={tag} style={styles.tagChip}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </Animated.View>
          </ExpandableFieldPressable>
        )}

        {/* ── Processing / failed ── */}
        {isProcessing && (
          <View style={styles.processingSection}>
            <View style={styles.banner}>
              <ActivityIndicator size="small" color={colors.warning} />
              <Text style={styles.bannerText}>{processingLabel}</Text>
            </View>

            {isCurrentLocalEntry && isLocalMode && (
              <View style={styles.localQueueHint}>
                <Ionicons name="hardware-chip-outline" size={14} color={colors.textTertiary} />
                <Text style={styles.localQueueHintText}>Currently running on-device</Text>
              </View>
            )}

            {canPrioritizeLocalEntry && (
              <Pressable style={styles.processNextButton} onPress={handleProcessNext}>
                <Ionicons name="play-forward-outline" size={16} color={colors.accent} />
                <Text style={styles.processNextButtonText}>{processNextLabel}</Text>
              </Pressable>
            )}
          </View>
        )}
        {entry.processing_status === 'failed' && (
          <View style={styles.failedSection}>
            <View style={[styles.banner, { backgroundColor: colors.errorSubtle }]}>
              <Ionicons name="warning-outline" size={15} color={colors.error} />
              <Text style={[styles.bannerText, { color: colors.error }]}>Processing failed.</Text>
            </View>
            <View style={styles.failedActions}>
              <Pressable style={styles.retryButton} onPress={handleRetry}>
                <Ionicons name="refresh-outline" size={16} color={colors.accent} />
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
              <Pressable style={styles.removeButton} onPress={handleRemove}>
                <Ionicons name="trash-outline" size={16} color={colors.error} />
                <Text style={styles.removeButtonText}>Remove</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Node divider ── */}
        {(keyDetails.length > 0 || sections.length > 0) && <NodeDivider catColor={catColor} />}

        {/* ── Content sections (new) or legacy insights grid ── */}
        {!isLegacy && sections.length > 0 && (
          <View style={styles.sectionsContainer}>
            {sections.map((section, i) => (
              <SectionBlock
                key={i}
                section={section}
                catColor={catColor}
                baseDelay={280 + i * 80}
                onViewItem={(itemIndex, field) => {
                  const item = section.items[itemIndex];
                  if (!item) return;
                  const value = field === 'label' ? (item.label || '') : item.text;
                  if (!value) return;
                  openValueViewer(
                    field === 'label' ? `Label · ${section.heading}` : (item.label || section.heading),
                    value,
                  );
                }}
                onEditItem={isCompleted ? (itemIndex, field) => handleEditSectionItem(i, itemIndex, field) : undefined}
              />
            ))}
          </View>
        )}
        {isLegacy && keyDetails.length > 0 && (
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
                  onViewLabel={() => openValueViewer('Label', d.label)}
                  onViewText={() => openValueViewer(d.label, d.value)}
                />
              ))}
            </View>
          </Animated.View>
        )}

        {/* ── Node divider ── */}
        {entry.video_transcript && (keyDetails.length > 0 || sections.length > 0) && <NodeDivider catColor={catColor} />}

        {/* ── Transcript ── */}
        {entry.video_transcript && (
          <Animated.View style={transcriptCrystal}>
            <Text style={styles.sectionLabel}>Transcript</Text>
            <TranscriptSection transcript={entry.video_transcript} />
          </Animated.View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      <ViewSheet
        config={viewerConfig}
        visible={!!viewerConfig}
        onClose={closeViewer}
      />

      <EditSheet
        config={editorConfig}
        visible={!!editorConfig}
        value={editorValue}
        saving={editorSaving}
        onChangeText={setEditorValue}
        onCancel={closeEditor}
        onSave={handleEditorSave}
      />

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

  // Editor sheet
  editorRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  editorBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 8, 6, 0.78)',
  },
  editorCard: {
    backgroundColor: colors.surfaceRaised,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.md,
    ...shadows.lg,
  },
  editorHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: borderRadius.full,
    backgroundColor: colors.border,
    opacity: 0.9,
  },
  editorTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  editorDescription: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginTop: -6,
  },
  editorInput: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  editorInputSingle: {
    minHeight: 58,
  },
  editorInputMultiline: {
    minHeight: 220,
  },
  editorActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  editorSecondaryButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorSecondaryButtonText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  editorPrimaryButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: borderRadius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorPrimaryButtonDisabled: {
    opacity: 0.5,
  },
  editorPrimaryButtonText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '700',
  },

  // Viewer sheet
  viewerRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  viewerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 8, 6, 0.78)',
  },
  viewerCard: {
    backgroundColor: colors.surfaceRaised,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.md,
    maxHeight: SCREEN_HEIGHT * 0.76,
    ...shadows.lg,
  },
  viewerScroll: {
    maxHeight: SCREEN_HEIGHT * 0.45,
  },
  viewerScrollContent: {
    paddingBottom: spacing.xs,
  },
  viewerText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 25,
  },

  // Header
  catRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  catMetaGroup: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, flex: 1, paddingRight: 8 },
  catPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 5,
    flexShrink: 1,
  },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2, flexShrink: 1 },
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
  processingSection: { gap: 10 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.md, ...shadows.sm,
  },
  bannerText: { color: colors.textSecondary, ...typography.caption },
  localQueueHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  localQueueHintText: {
    color: colors.textTertiary,
    fontSize: 12,
    fontWeight: '500',
  },
  processNextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accentSubtle,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  processNextButtonText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },

  // Failed entry actions
  failedSourceLink: {
    color: colors.accentMuted,
    fontSize: 13,
    textDecorationLine: 'underline',
    marginTop: 4,
  },
  failedSection: { gap: 12 },
  failedActions: { flexDirection: 'row', gap: 12 },
  retryButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.accentSubtle, borderRadius: borderRadius.md, paddingVertical: 14,
    borderWidth: 1, borderColor: colors.accent,
  },
  retryButtonText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  removeButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.errorSubtle, borderRadius: borderRadius.md, paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.error,
  },
  removeButtonText: { color: colors.error, fontSize: 14, fontWeight: '600' },
  headerRedoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceRaised,
    borderRadius: borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  headerRedoButtonText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },

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

  // Content type badge
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeLabel: {
    ...typography.mono,
    fontSize: 10,
    color: colors.textTertiary,
    textTransform: 'capitalize',
  },

  // Sections container
  sectionsContainer: { gap: 28 },

  // Ordered section (steps/timeline)
  orderedSection: { gap: 0 },
  orderedItem: { flexDirection: 'row', gap: 14, minHeight: 44 },
  stepConnector: { alignItems: 'center', width: 28 },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumber: { color: '#fff', fontSize: 12, fontWeight: '700' },
  stepLine: { flex: 1, width: 2, marginVertical: 4 },
  orderedText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
    paddingTop: 4,
    paddingBottom: 12,
  },

  // Unordered section (bullets)
  unorderedSection: { gap: 10 },
  unorderedItem: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  bulletDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  unorderedText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 21 },

  // Single section (prominent block)
  singleBlock: {
    flexDirection: 'row',
    gap: 14,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  singleBar: { width: 5, borderRadius: 3 },
  singleText: { flex: 1, color: colors.text, fontSize: 15, lineHeight: 24, fontWeight: '500' },

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
