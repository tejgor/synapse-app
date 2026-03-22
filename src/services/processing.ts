import { File } from 'expo-file-system';
import { getEntryById, updateEntry, getPendingEntries } from '../db/entries';
import { processEntry as callProcessAPI } from './api';

export async function processEntry(entryId: string): Promise<void> {
  try {
    await updateEntry(entryId, { processing_status: 'processing' });

    const entry = await getEntryById(entryId);
    if (!entry) return;

    // Read voice note as base64
    let voiceNoteBase64 = '';
    if (entry.voice_note_path) {
      try {
        const file = new File(entry.voice_note_path);
        voiceNoteBase64 = await file.base64();
      } catch {
        console.warn('Could not read voice note file');
      }
    }

    const result = await callProcessAPI(entry.video_url, voiceNoteBase64);

    await updateEntry(entryId, {
      video_transcript: result.videoTranscript,
      voice_note_transcript: result.voiceNoteTranscript,
      key_learnings: JSON.stringify(result.keyLearnings),
      topic_tag: result.topicTag,
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
