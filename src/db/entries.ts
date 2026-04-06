import { getDatabase } from './schema';
import type { Entry } from '../types';

export async function createEntry(entry: Omit<Entry, 'processed_at'>): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO entries (id, title, summary, category, tags, key_details, source_url, source_platform,
      video_transcript, processing_status, created_at, processed_at,
      author_name, author_username, thumbnail_url, duration, view_count, like_count, published_at, content_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    entry.author_name ?? null,
    entry.author_username ?? null,
    entry.thumbnail_url ?? null,
    entry.duration ?? null,
    entry.view_count ?? null,
    entry.like_count ?? null,
    entry.published_at ?? null,
    entry.content_type ?? null,
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
  fields: Partial<Pick<Entry, 'title' | 'summary' | 'category' | 'tags' | 'key_details' | 'video_transcript' | 'processing_status' | 'processed_at' | 'author_name' | 'author_username' | 'thumbnail_url' | 'duration' | 'view_count' | 'like_count' | 'published_at' | 'content_type'>>
): Promise<void> {
  const db = await getDatabase();
  const sets: string[] = [];
  const params: (string | number | null)[] = [];

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

export async function clearAllEntries(): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM entries');
}

export async function renameCategory(oldName: string, newName: string): Promise<number> {
  const db = await getDatabase();
  const result = await db.runAsync(
    'UPDATE entries SET category = ? WHERE category = ?',
    newName,
    oldName,
  );
  return result.changes;
}

export async function getPendingEntries(): Promise<Entry[]> {
  const db = await getDatabase();
  return db.getAllAsync<Entry>(
    `SELECT * FROM entries WHERE processing_status IN ('pending', 'failed', 'processing') ORDER BY created_at ASC`
  );
}

export async function getCategories(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ category: string }>(
    `SELECT category FROM entries WHERE category IS NOT NULL GROUP BY category ORDER BY COUNT(*) DESC`
  );
  return rows.map((r) => r.category);
}

export async function getTags(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ tags: string }>(
    `SELECT tags FROM entries WHERE tags IS NOT NULL AND tags != '[]'`
  );
  const tagSet = new Set<string>();
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.tags) as string[];
      for (const t of parsed) tagSet.add(t);
    } catch {}
  }
  return [...tagSet].sort();
}
