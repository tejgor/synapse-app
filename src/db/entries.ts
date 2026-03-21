import { getDatabase } from './schema';
import type { Entry } from '../types';

export async function createEntry(entry: Omit<Entry, 'processed_at'>): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO entries (id, source_platform, video_url, thumbnail_url, voice_note_path,
      voice_note_transcript, video_transcript, key_learnings, topic_tag, processing_status, created_at, processed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    entry.id,
    entry.source_platform,
    entry.video_url,
    entry.thumbnail_url,
    entry.voice_note_path,
    entry.voice_note_transcript,
    entry.video_transcript,
    entry.key_learnings,
    entry.topic_tag,
    entry.processing_status,
    entry.created_at,
    null,
  );
}

export async function getEntries(search?: string, tag?: string): Promise<Entry[]> {
  const db = await getDatabase();
  let query = 'SELECT * FROM entries';
  const conditions: string[] = [];
  const params: string[] = [];

  if (search) {
    conditions.push(
      `(key_learnings LIKE ? OR voice_note_transcript LIKE ? OR topic_tag LIKE ? OR video_transcript LIKE ?)`
    );
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  if (tag) {
    conditions.push('topic_tag = ?');
    params.push(tag);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC';

  return db.getAllAsync<Entry>(query, ...params);
}

export async function getEntryById(id: string): Promise<Entry | null> {
  const db = await getDatabase();
  return db.getFirstAsync<Entry>('SELECT * FROM entries WHERE id = ?', id);
}

export async function updateEntry(
  id: string,
  fields: Partial<Pick<Entry, 'voice_note_transcript' | 'video_transcript' | 'key_learnings' | 'topic_tag' | 'processing_status' | 'processed_at' | 'thumbnail_url'>>
): Promise<void> {
  const db = await getDatabase();
  const sets: string[] = [];
  const params: (string | null)[] = [];

  for (const [key, value] of Object.entries(fields)) {
    sets.push(`${key} = ?`);
    params.push(value ?? null);
  }

  params.push(id);
  await db.runAsync(`UPDATE entries SET ${sets.join(', ')} WHERE id = ?`, ...params);
}

export async function getPendingEntries(): Promise<Entry[]> {
  const db = await getDatabase();
  return db.getAllAsync<Entry>(
    `SELECT * FROM entries WHERE processing_status IN ('pending', 'failed') ORDER BY created_at ASC`
  );
}
