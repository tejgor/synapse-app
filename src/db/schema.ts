import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('synapse.db');

    // Check if we're on the old schema by looking for the video_url column
    let needsMigration = false;
    try {
      await db.execAsync(`SELECT video_url FROM entries LIMIT 1`);
      needsMigration = true;
    } catch {
      // video_url doesn't exist — either fresh install or already migrated
    }

    if (needsMigration) {
      // Migrate: rename old table, create new one, copy data, drop old
      await db.execAsync(`ALTER TABLE entries RENAME TO entries_old`);

      await db.execAsync(`
        CREATE TABLE entries (
          id TEXT PRIMARY KEY,
          title TEXT,
          summary TEXT,
          category TEXT,
          tags TEXT,
          key_details TEXT,
          source_url TEXT NOT NULL,
          source_platform TEXT NOT NULL,
          video_transcript TEXT,
          processing_status TEXT DEFAULT 'pending',
          processing_phase TEXT,
          created_at TEXT NOT NULL,
          processed_at TEXT
        );
      `);

      await db.execAsync(`
        INSERT INTO entries (id, source_url, source_platform, video_transcript, processing_status, processing_phase, created_at, processed_at, category)
        SELECT id, video_url, source_platform, video_transcript, processing_status, NULL, created_at, processed_at, topic_tag
        FROM entries_old;
      `);

      await db.execAsync(`DROP TABLE entries_old`);
    } else {
      // Fresh install or already migrated — ensure table exists
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS entries (
          id TEXT PRIMARY KEY,
          title TEXT,
          summary TEXT,
          category TEXT,
          tags TEXT,
          key_details TEXT,
          source_url TEXT NOT NULL,
          source_platform TEXT NOT NULL,
          video_transcript TEXT,
          processing_status TEXT DEFAULT 'pending',
          processing_phase TEXT,
          created_at TEXT NOT NULL,
          processed_at TEXT,
          author_name TEXT,
          author_username TEXT,
          thumbnail_url TEXT,
          duration REAL,
          view_count INTEGER,
          like_count INTEGER,
          published_at TEXT,
          content_type TEXT
        );
      `);
    }

    // Migrate: add metadata columns for existing installs
    const metadataColumns: [string, string][] = [
      ['processing_phase', 'TEXT'],
      ['author_name', 'TEXT'],
      ['author_username', 'TEXT'],
      ['thumbnail_url', 'TEXT'],
      ['duration', 'REAL'],
      ['view_count', 'INTEGER'],
      ['like_count', 'INTEGER'],
      ['published_at', 'TEXT'],
      ['content_type', 'TEXT'],
    ];
    for (const [col, type] of metadataColumns) {
      try {
        await db.execAsync(`SELECT ${col} FROM entries LIMIT 1`);
      } catch {
        await db.execAsync(`ALTER TABLE entries ADD COLUMN ${col} ${type}`);
      }
    }
  }
  return db;
}
