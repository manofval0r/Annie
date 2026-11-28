import { describe, it, expect, vi, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../src/app.js";
import { createDb } from "../../src/db/client.js";
import { telegramAdapter } from "../../src/channels/telegram.js";
import { whatsappAdapter } from "../../src/channels/whatsapp.js";

describe("Messaging Channel Adapters (Telegram & WhatsApp Cloud)", () => {
  const tempDirs: string[] = [];
  const makeDir = () => {
    const d = mkdtempSync(join(tmpdir(), "annie-ch-"));
    tempDirs.push(d);
    return d;
  };
  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    delete process.env.WHATSAPP_APP_SECRET;
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
  });

  it("fails closed on Telegram secret, preserves colon in bot token URL, and routes webhook", async () => {
    expect(telegramAdapter.verifySignature!(new Headers(), "")).toBe(false);

    process.env.TELEGRAM_WEBHOOK_SECRET = "tg-secret-123";
    expect(telegramAdapter.verifySignature!(new Headers({ "x-telegram-bot-api-secret-token": "wrong" }), "")).toBe(false);
    expect(telegramAdapter.verifySignature!(new Headers({ "x-telegram-bot-api-secret-token": "tg-secret-123" }), "")).toBe(true);

    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", mockFetch);
    process.env.TELEGRAM_BOT_TOKEN = "123456:ABC-DEF_xyz";
    await telegramAdapter.sendReply("98765", "Hello");
    expect(mockFetch.mock.calls[0][0]).toBe("https://api.telegram.org/bot123456:ABC-DEF_xyz/sendMessage");

    delete process.env.TELEGRAM_BOT_TOKEN;
    const db = createDb(":memory:");
    const app = createApp(db, { artifactDir: makeDir(), traceDir: makeDir() });
    const body = JSON.stringify({
      message: { message_id: 42, date: 1764288000, text: "Remind me to go to school Tuesday 6pm", chat: { id: 98765 } },
    });

    const unauth = await app.request("/webhooks/telegram", { method: "POST", body });
    expect(unauth.status).toBe(401);

    const ok = await app.request("/webhooks/telegram", {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": "tg-secret-123" },
      body,
    });
    expect(ok.status).toBe(200);
    db.close();
  });

  it("verifies WhatsApp Cloud X-Hub-Signature-256 and hub.verify_token", async () => {
    process.env.WHATSAPP_APP_SECRET = "meta-secret";
    process.env.WHATSAPP_VERIFY_TOKEN = "verify-me";
    const db = createDb(":memory:");
    const app = createApp(db, { artifactDir: makeDir(), traceDir: makeDir() });

    const verifyBad = await app.request("/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=X");
    expect(verifyBad.status).toBe(403);

    const verifyOk = await app.request("/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=CHALLENGE123");
    expect(verifyOk.status).toBe(200);
    expect(await verifyOk.text()).toBe("CHALLENGE123");

    const payload = JSON.stringify({
      entry: [{ changes: [{ value: { messages: [{ id: "wamid.1", from: "351910000000", timestamp: "1764288000", text: { body: "Remind me to go to school Tuesday 6pm" } }] } }] }],
    });
    const goodSig = `sha256=${createHmac("sha256", "meta-secret").update(payload).digest("hex")}`;

    const badRes = await app.request("/webhooks/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-signature-256": "sha256=deadbeef" },
      body: payload,
    });
    expect(badRes.status).toBe(401);

    const okRes = await app.request("/webhooks/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-signature-256": goodSig },
      body: payload,
    });
    expect(okRes.status).toBe(200);
    const data = (await okRes.json()) as { status: string; intent: string };
    expect(data.status).toBe("completed");
    expect(data.intent).toBe("schedule_reminder");
    expect(whatsappAdapter.verifySignature!(new Headers(), payload)).toBe(false);
    db.close();
  });
});
