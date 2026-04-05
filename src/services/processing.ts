import { Platform } from 'react-native';
import { getEntryById, updateEntry, getPendingEntries } from '../db/entries';
import { processEntry as callProcessAPI } from './api';

let BackgroundTask: { beginBackgroundTask(): void; endBackgroundTask(): void } | null = null;
if (Platform.OS === 'ios') {
  BackgroundTask = require('../../modules/background-task').default;
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function onProcessingUpdate(fn: Listener) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function notifyUpdate() {
  listeners.forEach((fn) => fn());
}

export async function processEntry(entryId: string): Promise<void> {
  BackgroundTask?.beginBackgroundTask();
  console.log(`[processing] start entryId=${entryId}`);
  try {
    await updateEntry(entryId, { processing_status: 'processing' });

    const entry = await getEntryById(entryId);
    if (!entry) {
      console.warn(`[processing] entry ${entryId} not found — skipping`);
      return;
    }

    console.log(`[processing] calling API for url=${entry.source_url} platform=${entry.source_platform}`);
    const result = await callProcessAPI(entry.source_url, entry.source_platform);

    await updateEntry(entryId, {
      video_transcript: result.videoTranscript,
      title: result.title,
      summary: result.summary,
      category: result.category,
      tags: JSON.stringify(result.tags),
      key_details: JSON.stringify(result.keyDetails),
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
    console.log(`[processing] completed entryId=${entryId} title="${result.title}"`);
  } catch (err) {
    console.error(`[processing] failed entryId=${entryId}:`, err);
    await updateEntry(entryId, { processing_status: 'failed' });
  } finally {
    BackgroundTask?.endBackgroundTask();
    notifyUpdate();
  }
}

export async function retryFailedEntries(): Promise<void> {
  const pending = await getPendingEntries();
  for (const entry of pending) {
    if (entry.processing_status === 'processing') {
      // Reset stale 'processing' entries from a prior run that was killed mid-flight
      await updateEntry(entry.id, { processing_status: 'pending' });
    }
    processEntry(entry.id).catch(() => {});
  }
}
