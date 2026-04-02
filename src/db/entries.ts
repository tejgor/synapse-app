import { getDatabase } from './schema';
import type { Entry } from '../types';

export async function createEntry(entry: Omit<Entry, 'processed_at'>): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO entries (id, title, summary, category, tags, key_details, source_url, source_platform,
      video_transcript, processing_status, created_at, processed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    entry.id,
    entry.title,
    entry.summary,
    entry.category,
    entry.tags,
    entry.key_details,
    entry.source_url,
    entry.source_platform,
    entry.video_transcript,
    entry.processing_status,
    entry.created_at,
    null,
  );
}

export async function getEntries(search?: string, category?: string): Promise<Entry[]> {
  const db = await getDatabase();
  let query = 'SELECT * FROM entries';
  const conditions: string[] = [];
  const params: string[] = [];

  if (search) {
    conditions.push(
      `(title LIKE ? OR summary LIKE ? OR tags LIKE ? OR key_details LIKE ? OR category LIKE ?)`
    );
    const term = `%${search}%`;
    params.push(term, term, term, term, term);
  }

  if (category) {
    conditions.push('category = ?');
    params.push(category);
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
  fields: Partial<Pick<Entry, 'title' | 'summary' | 'category' | 'tags' | 'key_details' | 'video_transcript' | 'processing_status' | 'processed_at'>>
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

export async function deleteEntry(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM entries WHERE id = ?', id);
}

export async function getPendingEntries(): Promise<Entry[]> {
  const db = await getDatabase();
  return db.getAllAsync<Entry>(
    `SELECT * FROM entries WHERE processing_status IN ('pending', 'failed') ORDER BY created_at ASC`
  );
}

export async function getCategories(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ category: string }>(
    `SELECT category FROM entries WHERE category IS NOT NULL GROUP BY category ORDER BY COUNT(*) DESC`
  );
  return rows.map((r) => r.category);
}
