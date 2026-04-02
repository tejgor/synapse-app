import { getEntryById, updateEntry, getPendingEntries } from '../db/entries';
import { processEntry as callProcessAPI } from './api';

export async function processEntry(entryId: string): Promise<void> {
  try {
    await updateEntry(entryId, { processing_status: 'processing' });

    const entry = await getEntryById(entryId);
    if (!entry) return;

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
    });
  } catch (err) {
    console.error('Processing failed for entry', entryId, err);
    await updateEntry(entryId, { processing_status: 'failed' });
  }
}

export async function retryFailedEntries(): Promise<void> {
  const pending = await getPendingEntries();
  for (const entry of pending) {
    processEntry(entry.id).catch(() => {});
  }
}
