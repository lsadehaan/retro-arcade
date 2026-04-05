import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const dbPath = process.env.DB_PATH ?? './data/app.db';

// Ensure data directory exists for file-based paths
if (dbPath !== ':memory:') {
  const dir = path.dirname(path.resolve(dbPath));
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT    NOT NULL UNIQUE,
    password_hash TEXT   NOT NULL,
    created_at   INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS scores (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id    TEXT    NOT NULL,
    score      INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// Additive migration: add difficulty column if it doesn't exist yet.
// Default 'normal' preserves all existing scores as Normal difficulty.
const cols = db.prepare("PRAGMA table_info(scores)").all();
if (!cols.some(c => c.name === 'difficulty')) {
  db.exec("ALTER TABLE scores ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'normal'");
}

export { db };
