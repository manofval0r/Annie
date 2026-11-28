import type { DatabaseSync } from "node:sqlite";
import { getOAuthToken } from "../auth/vault.js";
import { isUrlAllowed } from "../core/policy.js";
import { sanitiseExternalData } from "../core/sanitise.js";

export interface GmailSummary {
  mode: "live" | "sandbox";
  summary: string;
}

/**
 * Fetches recent unread Gmail messages using server-side OAuth token from vault.
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

  const timeoutSignal = AbortSignal.timeout(8_000);
  const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  try {
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: combined,
      redirect: "error",
    });
    if (!listRes.ok) {
      return { mode: "sandbox", summary: `Gmail returned HTTP ${listRes.status}. Reconnect Google in Accounts.` };
    }
    const listData = (await listRes.json()) as { messages?: Array<{ id: string }> };
    const ids = (listData.messages ?? []).slice(0, 3);
    if (ids.length === 0) return { mode: "live", summary: "Gmail inbox: 0 unread messages." };

    const snippets: string[] = [];
    for (const m of ids) {
      const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(m.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`;
      const mRes = await fetch(msgUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: combined,
        redirect: "error",
      });
      if (!mRes.ok) continue;
      const mData = (await mRes.json()) as { snippet?: string; payload?: { headers?: Array<{ name: string; value: string }> } };
      const subj = mData.payload?.headers?.find((h) => h.name.toLowerCase() === "subject")?.value || "(no subject)";
      const safe = sanitiseExternalData(`${subj}: ${mData.snippet || ""}`).clean.slice(0, 110);
      snippets.push(safe);
    }

    return {
      mode: "live",
      summary: `Gmail unread (${snippets.length}): ${snippets.join(" | ")}`,
    };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { mode: "sandbox", summary: "Gmail request failed or timed out." };
  }
}

/**
 * Builds a Google OAuth 2.0 consent URL for Gmail + Calendar + Search Console.
 */
export function buildGoogleOAuthUrl(state: string): string | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/auth/google/callback";
  if (!clientId) return null;
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
