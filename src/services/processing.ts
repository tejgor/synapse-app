import { Platform } from 'react-native';
import { getEntryById, updateEntry, getPendingEntries, getCategories, getTags } from '../db/entries';
import { processEntry as callProcessAPI, ApiError } from './api';
import type { ProcessResponse } from '../types';

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

// ─── Handle a completed background request result ─────────────────────────────

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
    const result = JSON.parse(response) as ProcessResponse;
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

// ─── Start processing an entry ────────────────────────────────────────────────

export async function processEntry(entryId: string): Promise<void> {
  console.log(`[processing] start entryId=${entryId}`);

  await updateEntry(entryId, { processing_status: 'processing' });

  const entry = await getEntryById(entryId);
  if (!entry) {
    console.warn(`[processing] entry ${entryId} not found — skipping`);
    return;
  }

  const [existingCategories, existingTags] = await Promise.all([getCategories(), getTags()]);

  if (Platform.OS === 'ios' && BackgroundRequest) {
    // Hand off to iOS background URLSession — no time limit, survives suspension/termination
    const apiUrl = `${process.env.EXPO_PUBLIC_API_URL}/api/process`;
    const bodyJson = JSON.stringify({ videoUrl: entry.source_url, platform: entry.source_platform, existingCategories, existingTags });
    const apiSecret = process.env.EXPO_PUBLIC_API_SECRET;
    const headersJson = JSON.stringify(apiSecret ? { 'X-API-Key': apiSecret } : {});
    console.log(`[processing] handing off to background URLSession url=${entry.source_url}`);
    BackgroundRequest.startRequest(entryId, apiUrl, bodyJson, headersJson);
  } else {
    // Foreground fallback (Android / development)
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
    if (inFlightIds.has(entry.id)) {
      console.log(`[processing] skip retry entryId=${entry.id} — background request in flight`);
      continue;
    }

    if (entry.processing_status === 'processing') {
      // No in-flight request — genuinely stale from a killed prior run
      await updateEntry(entry.id, { processing_status: 'pending' });
    }
    processEntry(entry.id).catch(() => {});
  }
}
