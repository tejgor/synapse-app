import { Platform, AppState } from 'react-native';
import { getEntryById, updateEntry, getPendingEntries, getCategories, getTags } from '../db/entries';
import { processEntry as callProcessAPI, ApiError } from './api';
import { getProcessingMode } from './settings';
import { getBackendConfig } from './backendConfig';
import { isModelReady } from './modelManager';
import { markBusy, markIdle } from './llmContext';
import { extractKnowledgeLocally } from './localExtraction';
import type { ProcessResponse } from '../types';

// Background task module — iOS only
let BackgroundTask: { beginBackgroundTask(): void; endBackgroundTask(): void } | null = null;
if (Platform.OS === 'ios') {
  BackgroundTask = require('../../modules/background-task').default;
}

// Track entries currently being processed locally (so retryFailedEntries skips them)
const localInFlight = new Set<string>();

// Background request module — iOS only
let BackgroundRequest: {
  startRequest(entryId: string, url: string, bodyJson: string, headersJson: string): void;
  getPendingResults(): Array<{ entryId: string; response?: string; error?: string; statusCode?: number }>;
  clearResult(entryId: string): void;
  getInFlightEntryIds(): string[];
} | null = null;

if (Platform.OS === 'ios') {
  BackgroundRequest = require('../../modules/background-request').default;
}

// ─── Event emitter (re-exported for _layout.tsx) ─────────────────────────────

type Listener = () => void;
const listeners = new Set<Listener>();

export function onProcessingUpdate(fn: Listener) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function notifyUpdate() {
  listeners.forEach((fn) => fn());
}

// ─── Local inference queue (sequential — single llama.rn context) ────────────

const inferenceQueue: string[] = [];
let inferenceRunning = false;

function enqueueLocalInference(entryId: string) {
  if (!inferenceQueue.includes(entryId)) {
    inferenceQueue.push(entryId);
  }
  drainInferenceQueue();
}

async function drainInferenceQueue() {
  if (inferenceRunning) return;
  inferenceRunning = true;

  BackgroundTask?.beginBackgroundTask();
  markBusy();

  while (inferenceQueue.length > 0) {
    if (AppState.currentState !== 'active') {
      console.log('[processing] app backgrounded — pausing inference queue');
      break;
    }

    const id = inferenceQueue.shift()!;
    localInFlight.add(id);
    try {
      await runLocalInference(id);
    } catch (err) {
      console.error(`[processing] inference failed entryId=${id}:`, err);
      await updateEntry(id, { processing_status: 'failed' });
      notifyUpdate();
    } finally {
      localInFlight.delete(id);
    }
  }

  markIdle();
  BackgroundTask?.endBackgroundTask();
  inferenceRunning = false;
}

async function runLocalInference(entryId: string): Promise<void> {
  console.log(`[processing] inference start entryId=${entryId}`);

  const entry = await getEntryById(entryId);
  if (!entry || !entry.video_transcript) {
    console.warn(`[processing] entry ${entryId} has no transcript — skipping inference`);
    return;
  }

  await updateEntry(entryId, { processing_status: 'processing' });
  notifyUpdate();

  const [existingCategories, existingTags] = await Promise.all([getCategories(), getTags()]);

  const metadata = {
    authorName: entry.author_name, authorUsername: entry.author_username,
    thumbnailUrl: entry.thumbnail_url, duration: entry.duration,
    viewCount: entry.view_count, likeCount: entry.like_count,
    publishedAt: entry.published_at,
  };

  const result = await extractKnowledgeLocally(
    entry.video_transcript,
    entry.source_url,
    metadata,
    existingCategories,
    existingTags,
  );

  await updateEntry(entryId, {
    title: result.title,
    summary: result.summary,
    category: result.category,
    tags: JSON.stringify(result.tags),
    key_details: JSON.stringify(result.sections || result.keyDetails),
    content_type: result.contentType || null,
    processing_status: 'completed',
    processed_at: new Date().toISOString(),
    ...(result.metadata ? {
      author_name: result.metadata.authorName,
      author_username: result.metadata.authorUsername,
      thumbnail_url: result.metadata.thumbnailUrl,
      duration: result.metadata.duration,
      view_count: result.metadata.viewCount,
      like_count: result.metadata.likeCount,
      published_at: result.metadata.publishedAt,
    } : {}),
  });
  console.log(`[processing] inference completed entryId=${entryId} title="${result.title}"`);
  notifyUpdate();
}

// ─── Handle a completed background request result ─────────────────────────────

function isTranscriptOnlyResult(parsed: Record<string, unknown>): boolean {
  // Transcript-only results have videoTranscript but no title
  return 'videoTranscript' in parsed && !('title' in parsed);
}

export async function handleBackgroundResult(event: {
  entryId: string;
  response?: string;
  error?: string;
  statusCode?: number;
}): Promise<void> {
  const { entryId, response, error, statusCode } = event;

  if (error || !response || statusCode !== 200) {
    console.error(`[processing] background result failed entryId=${entryId} error=${error ?? `HTTP ${statusCode}`}`);
    let meta: ProcessResponse['metadata'] | null = null;
    if (response) {
      try { meta = (JSON.parse(response) as { metadata?: ProcessResponse['metadata'] }).metadata ?? null; } catch {}
    }
    await updateEntry(entryId, {
      processing_status: 'failed',
      ...(meta ? {
        title: meta.originalTitle ?? null,
        author_name: meta.authorName,
        author_username: meta.authorUsername,
        thumbnail_url: meta.thumbnailUrl,
        duration: meta.duration,
        view_count: meta.viewCount,
        like_count: meta.likeCount,
        published_at: meta.publishedAt,
      } : {}),
    });
    notifyUpdate();
    return;
  }

  try {
    const parsed = JSON.parse(response) as Record<string, unknown>;

    if (isTranscriptOnlyResult(parsed)) {
      // Transcript-only result from /api/transcript — save and queue for local inference
      const meta = parsed.metadata as ProcessResponse['metadata'] | null;
      await updateEntry(entryId, {
        video_transcript: parsed.videoTranscript as string,
        ...(meta ? {
          author_name: meta.authorName,
          author_username: meta.authorUsername,
          thumbnail_url: meta.thumbnailUrl,
          duration: meta.duration,
          view_count: meta.viewCount,
          like_count: meta.likeCount,
          published_at: meta.publishedAt,
        } : {}),
      });
      console.log(`[processing] transcript stored entryId=${entryId}`);
      notifyUpdate();

      if (AppState.currentState === 'active') {
        enqueueLocalInference(entryId);
      } else {
        // Will be picked up by retryFailedEntries on foreground
        await updateEntry(entryId, { processing_status: 'pending' });
      }
      return;
    }

    // Cloud result — full ProcessResponse with title, summary, etc.
    const result = parsed as unknown as ProcessResponse;
    await updateEntry(entryId, {
      video_transcript: result.videoTranscript,
      title: result.title,
      summary: result.summary,
      category: result.category,
      tags: JSON.stringify(result.tags),
      key_details: JSON.stringify(result.sections || result.keyDetails),
      content_type: result.contentType || null,
      processing_status: 'completed',
      processed_at: new Date().toISOString(),
      ...(result.metadata ? {
        author_name: result.metadata.authorName,
        author_username: result.metadata.authorUsername,
        thumbnail_url: result.metadata.thumbnailUrl,
        duration: result.metadata.duration,
        view_count: result.metadata.viewCount,
        like_count: result.metadata.likeCount,
        published_at: result.metadata.publishedAt,
      } : {}),
    });
    console.log(`[processing] completed entryId=${entryId} title="${result.title}" contentType="${result.contentType}"`);
  } catch (err) {
    console.error(`[processing] failed to parse result entryId=${entryId}:`, err);
    await updateEntry(entryId, { processing_status: 'failed' });
  }

  notifyUpdate();
}

// ─── Local (on-device) processing path ───────────────────────────────────────

async function processEntryLocally(entryId: string): Promise<void> {
  const entry = await getEntryById(entryId);
  if (!entry) {
    console.warn(`[processing] entry ${entryId} not found — skipping`);
    return;
  }

  // If transcript already stored (retry case), go straight to inference
  if (entry.video_transcript) {
    console.log(`[processing] local — transcript exists, queuing inference entryId=${entryId}`);
    enqueueLocalInference(entryId);
    return;
  }

  // Hand off transcript fetch to BackgroundURLSession (same pattern as cloud flow)
  await updateEntry(entryId, { processing_status: 'processing' });
  notifyUpdate();

  if (Platform.OS === 'ios' && BackgroundRequest) {
    const { baseUrl, apiSecret, target } = await getBackendConfig();
    if (!baseUrl) {
      throw new Error(`No ${target === 'dev' ? 'development' : 'production'} API URL configured`);
    }

    const apiUrl = `${baseUrl}/api/transcript`;
    const bodyJson = JSON.stringify({ videoUrl: entry.source_url, platform: entry.source_platform });
    const headersJson = JSON.stringify(apiSecret ? { 'X-API-Key': apiSecret } : {});
    console.log(`[processing] local — handing transcript fetch to background URLSession backend=${target} url=${entry.source_url}`);
    BackgroundRequest.startRequest(entryId, apiUrl, bodyJson, headersJson);
  } else {
    // Foreground fallback (Android / development) — use cloud processing instead
    console.log(`[processing] local — no BackgroundRequest, falling back to cloud entryId=${entryId}`);
    processEntryCloud(entryId, entry);
  }
}

// ─── Cloud processing path ──────────────────────────────────────────────────

async function processEntryCloud(entryId: string, entry?: Awaited<ReturnType<typeof getEntryById>>): Promise<void> {
  if (!entry) {
    entry = await getEntryById(entryId);
    if (!entry) {
      console.warn(`[processing] entry ${entryId} not found — skipping`);
      return;
    }
  }

  await updateEntry(entryId, { processing_status: 'processing' });

  const [existingCategories, existingTags] = await Promise.all([getCategories(), getTags()]);

  if (Platform.OS === 'ios' && BackgroundRequest) {
    const { baseUrl, apiSecret, target } = await getBackendConfig();
    if (!baseUrl) {
      throw new Error(`No ${target === 'dev' ? 'development' : 'production'} API URL configured`);
    }

    const apiUrl = `${baseUrl}/api/process`;
    const bodyJson = JSON.stringify({ videoUrl: entry.source_url, platform: entry.source_platform, existingCategories, existingTags });
    const headersJson = JSON.stringify(apiSecret ? { 'X-API-Key': apiSecret } : {});
    console.log(`[processing] handing off to background URLSession backend=${target} url=${entry.source_url}`);
    BackgroundRequest.startRequest(entryId, apiUrl, bodyJson, headersJson);
  } else {
    try {
      console.log(`[processing] calling API (foreground) url=${entry.source_url}`);
      const result = await callProcessAPI(entry.source_url, entry.source_platform, existingCategories, existingTags);
      await updateEntry(entryId, {
        video_transcript: result.videoTranscript,
        title: result.title,
        summary: result.summary,
        category: result.category,
        tags: JSON.stringify(result.tags),
        key_details: JSON.stringify(result.sections || result.keyDetails),
        content_type: result.contentType || null,
        processing_status: 'completed',
        processed_at: new Date().toISOString(),
        ...(result.metadata ? {
          author_name: result.metadata.authorName,
          author_username: result.metadata.authorUsername,
          thumbnail_url: result.metadata.thumbnailUrl,
          duration: result.metadata.duration,
          view_count: result.metadata.viewCount,
          like_count: result.metadata.likeCount,
          published_at: result.metadata.publishedAt,
        } : {}),
      });
      console.log(`[processing] completed entryId=${entryId} title="${result.title}" contentType="${result.contentType}"`);
    } catch (err) {
      console.error(`[processing] failed entryId=${entryId}:`, err);
      const meta = err instanceof ApiError ? err.metadata : null;
      await updateEntry(entryId, {
        processing_status: 'failed',
        ...(meta ? {
          title: meta.originalTitle ?? null,
          author_name: meta.authorName,
          author_username: meta.authorUsername,
          thumbnail_url: meta.thumbnailUrl,
          duration: meta.duration,
          view_count: meta.viewCount,
          like_count: meta.likeCount,
          published_at: meta.publishedAt,
        } : {}),
      });
    }
    notifyUpdate();
  }
}

// ─── Start processing an entry ────────────────────────────────────────────────

export async function processEntry(entryId: string): Promise<void> {
  // Check if local processing is enabled and model is ready
  try {
    const mode = await getProcessingMode();
    if (mode === 'local' && await isModelReady()) {
      return processEntryLocally(entryId);
    }
  } catch {
    // Fall through to cloud processing on any settings error
  }

  console.log(`[processing] start entryId=${entryId}`);
  processEntryCloud(entryId);
}

// ─── Retry pending/failed entries on launch ───────────────────────────────────

export async function retryFailedEntries(): Promise<void> {
  // Check which entries already have in-flight background URLSession tasks
  const inFlightIds = new Set<string>();
  if (Platform.OS === 'ios' && BackgroundRequest) {
    try {
      for (const id of BackgroundRequest.getInFlightEntryIds()) inFlightIds.add(id);
    } catch {}
  }

  const pending = await getPendingEntries();
  for (const entry of pending) {
    if (inFlightIds.has(entry.id) || localInFlight.has(entry.id)) {
      console.log(`[processing] skip retry entryId=${entry.id} — already in flight`);
      continue;
    }

    if (entry.processing_status === 'processing') {
      // No in-flight request — genuinely stale from a killed prior run
      await updateEntry(entry.id, { processing_status: 'pending' });
    }
    processEntry(entry.id).catch(() => {});
  }
}
