import { timingSafeEqual } from "node:crypto";
import { isPrivateHost } from "../core/policy.js";
import type { ChannelAdapter, NormalizedMessage } from "../core/types.js";

interface BlueBubblesWebhook {
  type?: string;
  data?: {
    guid?: string;
    text?: string;
    isFromMe?: boolean;
    dateCreated?: number;
    handle?: { address?: string };
    chats?: Array<{ guid?: string }>;
  };
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function validateBlueBubblesUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    if (parsed.search || parsed.hash || parsed.username || parsed.password) return null;
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const clean = `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
    if (LOOPBACK_HOSTS.has(host) && (parsed.protocol === "http:" || parsed.protocol === "https:")) {
      return clean;
    }
    if (parsed.protocol === "https:" && !isPrivateHost(host)) {
      return clean;
    }
    return null;
  } catch {
    return null;
  }
}

export const bluebubblesAdapter: ChannelAdapter = {
  channel: "bluebubbles",

  verifySignature(headers: Headers): boolean {
    const expected = process.env.BLUEBUBBLES_WEBHOOK_SECRET;
    if (!expected) return false;
    const provided = headers.get("x-bluebubbles-secret") || "";
    const a = Buffer.from(provided, "utf8");
    const b = Buffer.from(expected, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  },

  normalize(rawPayload: unknown): NormalizedMessage {
    const payload = rawPayload as BlueBubblesWebhook;
    if (payload?.type && payload.type !== "new-message") {
      throw new Error(`Ignoring non-message BlueBubbles event: ${payload.type}`);
    }
    const d = payload?.data;
    if (!d || d.isFromMe || typeof d.text !== "string") {
      throw new Error("Ignoring outbound or empty BlueBubbles message");
    }
    const senderId = d.chats?.[0]?.guid || d.handle?.address;
    const text = d.text.trim();
    if (!senderId || !text) {
      throw new Error("BlueBubbles message missing sender or text");
    }
    const dt =
      typeof d.dateCreated === "number" && Number.isFinite(d.dateCreated)
        ? new Date(d.dateCreated)
        : null;
    const timestamp = dt && Number.isFinite(dt.getTime()) ? dt.toISOString() : new Date().toISOString();
    return {
      channel: "bluebubbles",
      senderId,
      text,
      messageId: `bb-${d.guid ?? Date.now()}`,
      timestamp,
    };
  },

  async sendReply(senderId: string, text: string): Promise<void> {
    const rawBase = process.env.BLUEBUBBLES_SERVER_URL;
    const password = process.env.BLUEBUBBLES_PASSWORD;
    if (!rawBase || !password) return;
    const base = validateBlueBubblesUrl(rawBase);
    if (!base) throw new Error("Invalid or unsafe BLUEBUBBLES_SERVER_URL");

    const url = `${base}/api/v1/message/text?password=${encodeURIComponent(password)}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatGuid: senderId,
          message: text,
          method: "apple-script",
        }),
        signal: AbortSignal.timeout(8_000),
        redirect: "error",
      });
      if (!res.ok) console.warn(`BlueBubbles sendReply returned HTTP ${res.status}`);
    } catch (err) {
      // Never log raw error URL which contains the server password query param
      const name = err instanceof Error ? err.name : "FetchError";
      console.warn(`BlueBubbles sendReply failed (${name})`);
    }
  },
};
