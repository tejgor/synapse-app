import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('synapse.db');
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        source_platform TEXT NOT NULL,
        video_url TEXT NOT NULL,
        thumbnail_url TEXT,
        voice_note_path TEXT,
        voice_note_transcript TEXT,
        video_transcript TEXT,
        key_learnings TEXT,
        topic_tag TEXT,
        processing_status TEXT DEFAULT 'pending',
        created_at TEXT NOT NULL,
        processed_at TEXT
      );
    `);
  }
  return db;
}
