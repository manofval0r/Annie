import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../src/app.js";
import { createDb } from "../../src/db/client.js";
import { bluebubblesAdapter, validateBlueBubblesUrl } from "../../src/channels/bluebubbles.js";

describe("BlueBubbles iMessage Channel Adapter", () => {
  const tempDirs: string[] = [];
  const makeDir = () => {
    const d = mkdtempSync(join(tmpdir(), "annie-bb-"));
    tempDirs.push(d);
    return d;
  };
  afterEach(() => {
    delete process.env.BLUEBUBBLES_WEBHOOK_SECRET;
    while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
  });

  it("fails closed on webhook secret, ignores isFromMe loops, and routes inbound iMessages", async () => {
    expect(bluebubblesAdapter.verifySignature!(new Headers(), "")).toBe(false);
    process.env.BLUEBUBBLES_WEBHOOK_SECRET = "bb-secret-99";

    const db = createDb(":memory:");
    const app = createApp(db, { artifactDir: makeDir(), traceDir: makeDir() });

    // Ignore outbound self-messages to avoid infinite reply loops
    const selfBody = JSON.stringify({
      type: "new-message",
      data: { guid: "m-1", text: "Hello", isFromMe: true, chats: [{ guid: "iMessage;-;+15551234567" }] },
    });
    const ignored = await app.request("/webhooks/bluebubbles", {
      method: "POST",
      headers: { "x-bluebubbles-secret": "bb-secret-99" },
      body: selfBody,
    });
    expect(ignored.status).toBe(200);
    expect((await ignored.json()).ignored).toBe(true);

    // Process real inbound iMessage
    const inbound = JSON.stringify({
      type: "new-message",
      data: {
        guid: "m-2",
        text: "Remind me to go to school Tuesday 6pm",
        isFromMe: false,
        dateCreated: Date.now(),
        chats: [{ guid: "iMessage;-;+15551234567" }],
      },
    });
    const unauth = await app.request("/webhooks/bluebubbles", { method: "POST", body: inbound });
    expect(unauth.status).toBe(401);

    const ok = await app.request("/webhooks/bluebubbles", {
      method: "POST",
      headers: { "x-bluebubbles-secret": "bb-secret-99" },
      body: inbound,
    });
    expect(ok.status).toBe(200);
    const data = (await ok.json()) as { status: string; intent: string };
    expect(data.status).toBe("completed");
    expect(data.intent).toBe("schedule_reminder");
    db.close();
  });

  it("blocks private IPv4/IPv6/0.0.0.0 SSRF URLs and tolerates NaN dateCreated", async () => {
    expect(validateBlueBubblesUrl("http://localhost:1234")).toBe("http://localhost:1234");
    expect(validateBlueBubblesUrl("https://0.0.0.0:1234")).toBeNull();
    expect(validateBlueBubblesUrl("https://[fc00::1]")).toBeNull();
    expect(validateBlueBubblesUrl("https://[::ffff:169.254.169.254]")).toBeNull();
    expect(validateBlueBubblesUrl("https://bb.example.com?extra=1")).toBeNull();

    const msg = await bluebubblesAdapter.normalize({
      type: "new-message",
      data: { guid: "m-nan", text: "Hello", isFromMe: false, dateCreated: Number.NaN, chats: [{ guid: "c1" }] },
    });
    expect(Number.isFinite(Date.parse(msg.timestamp))).toBe(true);
    expect(() => bluebubblesAdapter.normalize({ type: "typing-indicator", data: {} })).toThrow();
  });
});
