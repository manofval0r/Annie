import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getOAuthToken, saveOAuthConnection } from "../auth/vault.js";
import { isUrlAllowed } from "../core/policy.js";
import { sanitiseExternalData } from "../core/sanitise.js";

export interface GmailSummary {
  mode: "live" | "sandbox";
  summary: string;
}

const oauthStates = new Map<string, { userId: string; expiresAt: number }>();

function combineSignal(signal?: AbortSignal, timeoutMs = 8_000): AbortSignal {
  const t = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, t]) : t;
}

/**
 * Fetches recent unread Gmail messages concurrently using server-side OAuth token from vault.
 * Sanitises subjects/snippets through sanitiseExternalData to block indirect prompt injection.
 */
export async function fetchGmailInbox(
  db: DatabaseSync,
  userId: string,
  signal?: AbortSignal
): Promise<GmailSummary> {
  const token = getOAuthToken(db, userId, "google_gmail");
  if (!token || token.startsWith("sandbox_")) {
    return {
      mode: "sandbox",
      summary:
        "Gmail (sandbox, shared across Web + Telegram + WhatsApp): 2 unread — (1) Fiber Broadband renewal notice (EUR 45 -> EUR 54), (2) University lab reminder for Tuesday 18:00.",
    };
  }

  const listUrl = "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=3";
  if (!isUrlAllowed(listUrl).allowed) throw new Error("SSRF blocked Gmail");
  const combined = combineSignal(signal);

  try {
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: combined,
      redirect: "error",
    });
    if (!listRes.ok) {
      return { mode: "sandbox", summary: `Gmail returned HTTP ${listRes.status}. Reconnect Google in Accounts.` };
    }
    const listData = (await listRes.json()) as { messages?: Array<{ id?: string }> };
    const ids = (listData.messages ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .slice(0, 3);
    if (ids.length === 0) return { mode: "live", summary: "Gmail inbox: 0 unread messages." };

    const results = await Promise.all(
      ids.map(async (id) => {
        const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`;
        if (!isUrlAllowed(msgUrl).allowed) return null;
        const mRes = await fetch(msgUrl, {
          headers: { Authorization: `Bearer ${token}` },
          signal: combined,
          redirect: "error",
        });
        if (!mRes.ok) return null;
        const mData = (await mRes.json()) as {
          snippet?: string;
          payload?: { headers?: Array<{ name: string; value: string }> };
        };
        const subj =
          mData.payload?.headers?.find((h) => h.name.toLowerCase() === "subject")?.value || "(no subject)";
        return sanitiseExternalData(`${subj}: ${mData.snippet || ""}`).clean.slice(0, 110);
      })
    );

    const snippets = results.filter((s): s is string => Boolean(s));
    if (snippets.length === 0) {
      return { mode: "sandbox", summary: "Could not read Gmail message metadata; try reconnecting Google." };
    }
    return { mode: "live", summary: `Gmail unread (${snippets.length}): ${snippets.join(" | ")}` };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { mode: "sandbox", summary: "Gmail request failed or timed out." };
  }
}

/**
 * Generates a CSRF-protected Google OAuth 2.0 consent URL with a single-use random state nonce.
 */
export function buildGoogleOAuthUrl(userId: string): string | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/auth/google/callback";
  if (!clientId) return null;

  const now = Date.now();
  for (const [k, v] of oauthStates) {
    if (v.expiresAt < now) oauthStates.delete(k);
  }
  const state = randomBytes(16).toString("hex");
  oauthStates.set(state, { userId, expiresAt: now + 10 * 60_000 });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/webmasters.readonly",
    ].join(" "),
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Verifies single-use CSRF state, exchanges authorization code at Google's token endpoint,
 * and stores encrypted tokens in the shared vault.
 */
export async function completeGoogleOAuthCallback(
  db: DatabaseSync,
  code: string,
  state: string
): Promise<{ ok: boolean; userId?: string; error?: string }> {
  const entry = oauthStates.get(state);
  oauthStates.delete(state);
  if (!entry || entry.expiresAt < Date.now()) {
    return { ok: false, error: "Invalid or expired OAuth state" };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/auth/google/callback";
  if (!clientId || !clientSecret) {
    return { ok: false, error: "Google OAuth credentials not configured" };
  }

  const tokenUrl = "https://oauth2.googleapis.com/token";
  if (!isUrlAllowed(tokenUrl).allowed) return { ok: false, error: "SSRF blocked token URL" };

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(8_000),
    redirect: "error",
  });
  if (!res.ok) return { ok: false, error: `Google token exchange failed (HTTP ${res.status})` };

  const tokens = (await res.json()) as { access_token?: string; refresh_token?: string; scope?: string };
  if (!tokens.access_token) return { ok: false, error: "Missing access_token in Google response" };

  saveOAuthConnection(db, {
    userId: entry.userId,
    provider: "google_gmail",
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    scopes: tokens.scope || "gmail.readonly calendar.events webmasters.readonly",
  });
  return { ok: true, userId: entry.userId };
}
