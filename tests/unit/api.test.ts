import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../src/app.js";
import { createDb } from "../../src/db/client.js";

describe("Hono HTTP API, Sandbox, Artifacts & Proactive Tick", () => {
  const tempDirs: string[] = [];
  const makeDir = () => {
    const d = mkdtempSync(join(tmpdir(), "annie-api-"));
    tempDirs.push(d);
    return d;
  };
  afterEach(() => {
    while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
  });

  it("runs sandbox -> reminder -> .ics download -> proactive T-30m tick end-to-end", async () => {
    const db = createDb(":memory:");
    const app = createApp(db, { artifactDir: makeDir(), traceDir: makeDir() });

    const sbRes = await app.request("/api/sandbox", { method: "POST" });
    expect(sbRes.status).toBe(200);
    const sb = (await sbRes.json()) as { userId: string; linkCode: string };
    expect(sb.userId).toBe("usr-sandbox");
    expect(sb.linkCode).toMatch(/^LINK-\d{6}$/);

    const msgRes = await app.request("/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channel: "web",
        senderId: "web-sandbox",
        text: "Remind me to go to school Tuesday 6pm",
      }),
    });
    expect(msgRes.status).toBe(200);
    const run = (await msgRes.json()) as { status: string; reminderId: string; runId: string };
    expect(run.status).toBe("completed");
    expect(run.reminderId).toMatch(/^rem-/);

    // Download generated .ics
    const icsRes = await app.request(`/artifacts/${run.reminderId}.ics`);
    expect(icsRes.status).toBe(200);
    expect(await icsRes.text()).toContain("BEGIN:VCALENDAR");

    // Path traversal attempt is blocked
    const badRes = await app.request("/artifacts/..%2F..%2Fpackage.json");
    expect(badRes.status).toBe(400);

    // Fast-forward T-30m heartbeat tick
    const tickRes = await app.request("/api/debug/tick", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(tickRes.status).toBe(200);
    const tick = (await tickRes.json()) as { processed: number; alerts: Array<{ body: string }> };
    expect(tick.processed).toBe(1);
    expect(tick.alerts[0].body).toContain("directions");

    // Kill switch rejects cross-user caller, accepts owner
    const killDenied = await app.request(`/kill/${run.runId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "telegram", senderId: "stranger" }),
    });
    expect(killDenied.status).toBe(404);

    const killOk = await app.request(`/kill/${run.runId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "web", senderId: "web-sandbox" }),
    });
    expect(killOk.status).toBe(200);
    db.close();
  });
});
