import { timingSafeEqual } from "node:crypto";
import { isUrlAllowed } from "../core/policy.js";
import type { ActionButton, ChannelAdapter, NormalizedMessage } from "../core/types.js";

interface TelegramUpdate {
  message?: {
    message_id?: number;
    date?: number;
    text?: string;
    chat?: { id?: number | string };
  };
}

export const telegramAdapter: ChannelAdapter = {
  channel: "telegram",

  verifySignature(headers: Headers): boolean {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!expected) return true;
    const provided = headers.get("x-telegram-bot-api-secret-token") || "";
    const a = Buffer.from(provided, "utf8");
    const b = Buffer.from(expected, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  },

  normalize(rawPayload: unknown): NormalizedMessage {
    const update = rawPayload as TelegramUpdate;
    const msg = update?.message;
    const chatId = msg?.chat?.id;
    const text = msg?.text?.trim();
    if (!chatId || !text) {
      throw new Error("Telegram update missing chat.id or text");
    }
    return {
      channel: "telegram",
      senderId: String(chatId),
      text,
      messageId: `tg-${msg.message_id ?? Date.now()}`,
      timestamp: msg.date ? new Date(msg.date * 1000).toISOString() : new Date().toISOString(),
    };
  },

  async sendReply(senderId: string, text: string, buttons?: ActionButton[]): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;
    const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`;
    const check = isUrlAllowed(url);
    if (!check.allowed) throw new Error(`SSRF blocked Telegram: ${check.reason}`);

    const body: Record<string, unknown> = { chat_id: senderId, text };
    if (buttons && buttons.length > 0) {
      body.reply_markup = {
        inline_keyboard: [
          buttons.map((b) =>
            b.url?.startsWith("https://")
              ? { text: b.label, url: b.url }
              : { text: b.label, callback_data: b.action.slice(0, 64) }
          ),
        ],
      };
    }

    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
      redirect: "error",
    });
  },
};
