import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
    const alerts: Array<{ body: string }> = [];
    const app = createApp(db, {
      artifactDir: makeDir(),
      traceDir: makeDir(),
      heartbeatDeps: {
        getRouteEta: async () => ({
          durationMinutes: 16,
          distanceKm: 2.1,
          mapsUrl: "https://www.openstreetmap.org/directions?from=38.71,-9.13&to=38.73,-9.14",
        }),
        getWeather: async () => ({ tempC: 19, rainProbability: 60, summary: "light rain" }),
        notify: async (p) => {
          alerts.push({ body: p.body });
        },
      },
    });

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
    expect(alerts[0].body).toContain("directions");

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

  it("serves valid built assets and blocks traversal or invalid extensions", async () => {
    const db = createDb(":memory:");
    const pubDir = makeDir();
    mkdirSync(join(pubDir, "assets"), { recursive: true });
    writeFileSync(join(pubDir, "assets", "index-abc123.js"), "console.log('ok');");
    const app = createApp(db, { publicDir: pubDir, artifactDir: makeDir(), traceDir: makeDir() });

    const ok = await app.request("/assets/index-abc123.js");
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toContain("application/javascript");

    expect((await app.request("/assets/..%2Fpackage.json")).status).toBe(404);
    expect((await app.request("/assets/..%2F..%2Findex.js")).status).toBe(404);
    expect((await app.request("/assets/secret.env")).status).toBe(404);
    expect((await app.request("/assets/nested.dot.js")).status).toBe(404);
    db.close();
  });
});
