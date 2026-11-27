import { randomBytes, randomInt } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { decryptSecret, encryptSecret } from "../core/crypto.js";
import type { Channel } from "../core/types.js";

export interface OAuthConnectionSummary {
  id: string;
  provider: string;
  scopes: string;
  createdAt: string;
}

export function ensureUser(db: DatabaseSync, id: string, email: string, name: string, isSandbox = false): void {
  db.prepare(
    `INSERT OR IGNORE INTO users (id, email, name, is_sandbox, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, email, name, isSandbox ? 1 : 0, new Date().toISOString());
}

/**
 * Generates a 6-digit one-time LINK-XXXXXX code valid for 10 minutes
 * so a user logged into Web PWA can link Telegram/WhatsApp to the same userId.
 */
export function generateLinkCode(db: DatabaseSync, userId: string, now = new Date()): string {
  db.prepare("DELETE FROM link_codes WHERE expires_at < ?").run(now.toISOString());
  const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = `LINK-${String(randomInt(100000, 1000000))}`;
    const res = db
      .prepare("INSERT OR IGNORE INTO link_codes (code, user_id, expires_at, used) VALUES (?, ?, ?, 0)")
      .run(code, userId, expiresAt);
    if (res.changes === 1) return code;
  }
  throw new Error("Failed to generate unique link code");
}

/**
 * Atomically redeems a LINK-XXXXXX code and binds (channel, senderId) -> userId.
 */
export function redeemLinkCode(
  db: DatabaseSync,
  channel: Channel,
  senderId: string,
  code: string,
  now = new Date()
): { linked: boolean; userId?: string; reason: string } {
  const row = db
    .prepare("SELECT code, user_id, expires_at, used FROM link_codes WHERE code = ?")
    .get(code.toUpperCase()) as
    | { code: string; user_id: string; expires_at: string; used: number }
    | undefined;

  if (!row || row.used) {
    return { linked: false, reason: "Invalid or already used link code" };
  }
  if (Date.parse(row.expires_at) < now.getTime()) {
    return { linked: false, reason: "Link code expired" };
  }

  const claim = db.prepare("UPDATE link_codes SET used = 1 WHERE code = ? AND used = 0").run(row.code);
  if (claim.changes === 0) {
    return { linked: false, reason: "Link code already redeemed" };
  }

  const id = `cid-${randomBytes(4).toString("hex")}`;
  db.prepare(
    `INSERT INTO channel_identities (id, channel, sender_id, user_id, verified_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(channel, sender_id) DO UPDATE SET user_id = excluded.user_id, verified_at = excluded.verified_at`
  ).run(id, channel, senderId, row.user_id, now.toISOString());

  return { linked: true, userId: row.user_id, reason: "Channel linked to unified account" };
}

export function resolveChannelUserId(db: DatabaseSync, channel: Channel, senderId: string): string {
  const row = db
    .prepare("SELECT user_id FROM channel_identities WHERE channel = ? AND sender_id = ?")
    .get(channel, senderId) as { user_id: string } | undefined;
  return row ? row.user_id : `${channel}:${senderId}`;
}

export function saveOAuthConnection(
  db: DatabaseSync,
  input: {
    userId: string;
    provider: string;
    accessToken: string;
    refreshToken?: string;
    scopes: string;
    expiresAt?: string;
  }
): string {
  const id = `conn-${randomBytes(4).toString("hex")}`;
  const encAccess = encryptSecret(input.accessToken);
  const encRefresh = input.refreshToken ? encryptSecret(input.refreshToken) : null;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO oauth_connections (id, user_id, provider, encrypted_access_token, encrypted_refresh_token, scopes, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, provider) DO UPDATE SET
       encrypted_access_token = excluded.encrypted_access_token,
       encrypted_refresh_token = excluded.encrypted_refresh_token,
       scopes = excluded.scopes,
       expires_at = excluded.expires_at`
  ).run(id, input.userId, input.provider, encAccess, encRefresh, input.scopes, input.expiresAt ?? null, now);

  return id;
}

/**
 * Server-side token retrieval only. NEVER pass the returned token into LLM prompts or logs.
 */
export function getOAuthToken(db: DatabaseSync, userId: string, provider: string): string | null {
  const row = db
    .prepare("SELECT encrypted_access_token FROM oauth_connections WHERE user_id = ? AND provider = ?")
    .get(userId, provider) as { encrypted_access_token: string } | undefined;
  if (!row) return null;
  return decryptSecret(row.encrypted_access_token);
}

/**
 * Returns safe metadata for the UI Connections panel (never exposes tokens).
 */
export function listOAuthConnections(db: DatabaseSync, userId: string): OAuthConnectionSummary[] {
  return db
    .prepare(
      `SELECT id, provider, scopes, created_at as createdAt
       FROM oauth_connections WHERE user_id = ? ORDER BY provider ASC`
    )
    .all(userId) as unknown as OAuthConnectionSummary[];
}

/**
 * Seeds a 1-click Judge Sandbox account with saved places (home + school)
 * and encrypted sandbox OAuth tokens so judges need zero external credentials.
 */
export function enableJudgeSandbox(db: DatabaseSync, webSenderId = "web-sandbox"): {
  userId: string;
  linkCode: string;
  connections: OAuthConnectionSummary[];
} {
  const userId = "usr-sandbox";
  ensureUser(db, userId, "sandbox@annie.local", "Judge Sandbox", true);

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO channel_identities (id, channel, sender_id, user_id, verified_at)
     VALUES (?, 'web', ?, ?, ?)
     ON CONFLICT(channel, sender_id) DO UPDATE SET user_id = excluded.user_id, verified_at = excluded.verified_at`
  ).run("cid-sandbox-web", webSenderId, userId, now);

  db.prepare(
    `INSERT OR IGNORE INTO saved_places (id, user_id, label, address, lat, lon)
     VALUES ('place-home', ?, 'home', 'Baixa, Lisbon', 38.7117, -9.1367)`
  ).run(userId);
  db.prepare(
    `INSERT OR IGNORE INTO saved_places (id, user_id, label, address, lat, lon)
     VALUES ('place-school', ?, 'school', 'Instituto Superior Tecnico, Lisbon', 38.7369, -9.1387)`
  ).run(userId);

  saveOAuthConnection(db, {
    userId,
    provider: "google_gmail",
    accessToken: "sandbox_mock_gmail_token",
    scopes: "gmail.readonly calendar.events",
  });
  saveOAuthConnection(db, {
    userId,
    provider: "google_search_console",
    accessToken: "sandbox_mock_gsc_token",
    scopes: "webmasters.readonly",
  });
  saveOAuthConnection(db, {
    userId,
    provider: "treg",
    accessToken: "sandbox_mock_treg_token",
    scopes: "tiktok.read seo.read",
  });

  const linkCode = generateLinkCode(db, userId);
  return { userId, linkCode, connections: listOAuthConnections(db, userId) };
}
