import { createHmac, timingSafeEqual } from "node:crypto";
import { isUrlAllowed } from "../core/policy.js";
import type { ChannelAdapter, NormalizedMessage } from "../core/types.js";

interface WhatsAppWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
}

export const whatsappAdapter: ChannelAdapter = {
  channel: "whatsapp",

  verifySignature(headers: Headers, rawBody: string): boolean {
    const secret = process.env.WHATSAPP_APP_SECRET;
    if (!secret) return false; // fail closed if webhook secret is unset
    const sig = headers.get("x-hub-signature-256") || "";
    if (!sig.startsWith("sha256=")) return false;
    const expected = `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expected, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  },

  normalize(rawPayload: unknown): NormalizedMessage {
    const payload = rawPayload as WhatsAppWebhookPayload;
    const msg = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const from = msg?.from;
    const text = msg?.text?.body?.trim();
    if (!from || !text) {
      throw new Error("WhatsApp webhook missing sender or text body");
    }
    const tsNum = msg.timestamp ? Number(msg.timestamp) : Number.NaN;
    return {
      channel: "whatsapp",
      senderId: from,
      text,
      messageId: `wa-${msg.id ?? Date.now()}`,
      timestamp: Number.isFinite(tsNum) ? new Date(tsNum * 1000).toISOString() : new Date().toISOString(),
    };
  },

  async sendReply(senderId: string, text: string): Promise<void> {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneId) return;

    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneId)}/messages`;
    const check = isUrlAllowed(url);
    if (!check.allowed) throw new Error(`SSRF blocked WhatsApp: ${check.reason}`);

    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: senderId,
        type: "text",
        text: { body: text },
      }),
      signal: AbortSignal.timeout(8_000),
      redirect: "error",
    });
  },
};
