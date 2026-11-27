import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function createDb(dbPath = process.env.DATABASE_URL || "./data/annie.db") {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const sqlite = new DatabaseSync(dbPath);
  sqlite.exec("PRAGMA journal_mode = WAL;");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT,
      is_sandbox INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS channel_identities (
      id TEXT PRIMARY KEY, channel TEXT NOT NULL, sender_id TEXT NOT NULL,
      user_id TEXT NOT NULL, verified_at TEXT NOT NULL,
      UNIQUE(channel, sender_id)
    );
    CREATE TABLE IF NOT EXISTS link_codes (
      code TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS oauth_connections (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL,
      encrypted_access_token TEXT NOT NULL, encrypted_refresh_token TEXT,
      scopes TEXT NOT NULL, expires_at TEXT, created_at TEXT NOT NULL,
      UNIQUE(user_id, provider)
    );
    CREATE TABLE IF NOT EXISTS saved_places (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, label TEXT NOT NULL,
      address TEXT NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, channel TEXT NOT NULL,
      sender_id TEXT NOT NULL, intent TEXT NOT NULL, status TEXT NOT NULL,
      estimated_cost_usd REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL, finished_at TEXT
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, seq INTEGER NOT NULL,
      ts TEXT NOT NULL, actor TEXT NOT NULL, type TEXT NOT NULL, summary TEXT NOT NULL,
      payload_hash TEXT NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL,
      UNIQUE(run_id, seq)
    );
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, run_id TEXT NOT NULL, title TEXT NOT NULL,
      location_label TEXT, event_at TEXT NOT NULL, notify_at TEXT NOT NULL,
      channel TEXT NOT NULL, sender_id TEXT NOT NULL, ics_artifact_id TEXT,
      status TEXT NOT NULL DEFAULT 'scheduled'
    );
    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL, user_id TEXT NOT NULL,
      action TEXT NOT NULL, amount_usd REAL DEFAULT 0,
      used INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kill_flags (
      run_id TEXT PRIMARY KEY, killed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS seen_messages (
      message_id TEXT PRIMARY KEY, channel TEXT NOT NULL, seen_at TEXT NOT NULL
    );
  `);

  return sqlite;
}
