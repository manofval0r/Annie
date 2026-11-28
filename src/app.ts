import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { enableJudgeSandbox, listOAuthConnections, resolveChannelUserId } from "./auth/vault.js";
import { buildGoogleOAuthUrl, completeGoogleOAuthCallback } from "./tools/google.js";
import { subscribeAuditEvents, type StoredAuditEvent } from "./core/audit.js";
import { tickHeartbeat, type HeartbeatDeps } from "./core/heartbeat.js";
import { triggerKill } from "./core/kill.js";
import { runPipeline } from "./core/orchestrator.js";
import { triggerVoiceReminder } from "./tools/telnyx-voice.js";
import { fetchOpenMeteoWeather, fetchOsrmRouteEta, sendNtfyAlert } from "./tools/free-apis.js";
import { telegramAdapter } from "./channels/telegram.js";
import { whatsappAdapter } from "./channels/whatsapp.js";
import { ChannelSchema, NormalizedMessageSchema } from "./core/types.js";

const SAFE_ICS_RE = /^rem-[a-f0-9]+\.ics$/;

export interface AppOptions {
  artifactDir?: string;
  publicDir?: string;
  traceDir?: string;
  heartbeatDeps?: HeartbeatDeps;
}

export function createApp(db: DatabaseSync, opts: AppOptions = {}) {
  const app = new Hono();
  const artifactDir = opts.artifactDir ?? "./data/artifacts";
  const publicDir = opts.publicDir ?? "./public";
  const traceDir = opts.traceDir ?? "./traces";
  const proactiveAlerts: Array<{ ts: string; title: string; body: string; buttons: unknown[] }> = [];

  const defaultHeartbeatDeps: HeartbeatDeps = opts.heartbeatDeps ?? {
    getRouteEta: async (from, to) => {
      const live = await fetchOsrmRouteEta(from, to);
      return (
        live ?? {
          durationMinutes: 16,
          distanceKm: 2.1,
          mapsUrl: `https://www.openstreetmap.org/directions?from=${from.lat},${from.lon}&to=${to.lat},${to.lon}`,
        }
      );
    },
    getWeather: async (lat, lon) => {
      const live = await fetchOpenMeteoWeather(lat, lon);
      return live ?? { tempC: 19, rainProbability: 60, summary: "light rain (cached fallback)" };
    },
    notify: async (payload) => {
      proactiveAlerts.unshift({
        ts: new Date().toISOString(),
        title: payload.title,
        body: payload.body,
        buttons: payload.buttons,
      });
      if (proactiveAlerts.length > 50) proactiveAlerts.pop();
      if (process.env.NTFY_TOPIC) {
        await sendNtfyAlert(process.env.NTFY_TOPIC, payload);
      }
    },
  };

  app.get("/health", (c) => c.json({ ok: true, service: "annie" }));

  app.get("/", (c) => {
    const htmlPath = join(publicDir, "index.html");
    if (!existsSync(htmlPath)) return c.text("Annie API online", 200);
    return c.html(readFileSync(htmlPath, "utf8"));
  });

  app.get("/manifest.json", (c) => {
    const p = join(publicDir, "manifest.json");
    if (!existsSync(p)) return c.notFound();
    return c.body(readFileSync(p, "utf8"), 200, { "Content-Type": "application/manifest+json" });
  });

  app.get("/sw.js", (c) => {
    const p = join(publicDir, "sw.js");
    if (!existsSync(p)) return c.notFound();
    return c.body(readFileSync(p, "utf8"), 200, { "Content-Type": "application/javascript" });
  });

  app.get("/annie-mascot.json", (c) => {
    const p = join(publicDir, "annie-mascot.json");
    if (!existsSync(p)) return c.notFound();
    return c.body(readFileSync(p, "utf8"), 200, { "Content-Type": "application/json" });
  });

  app.post("/message", async (c) => {
    const raw = await c.req.json().catch(() => null);
    const parsed = NormalizedMessageSchema.safeParse({
      channel: raw?.channel ?? "web",
      senderId: raw?.senderId ?? "web-sandbox",
      text: raw?.text ?? "",
      messageId: raw?.messageId ?? `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: raw?.timestamp ?? new Date().toISOString(),
    });
    if (!parsed.success) {
      return c.json({ error: "Invalid message payload", details: parsed.error.flatten() }, 400);
    }
    const result = await runPipeline(db, parsed.data, { artifactDir, traceDir });
    return c.json(result);
  });

  app.get("/monitor", (c) => {
    return streamSSE(c, async (stream) => {
      if (c.req.raw.signal.aborted) return;
      let unsubscribe: () => void = () => {};
      try {
        await stream.writeSSE({ event: "connected", data: JSON.stringify({ ts: new Date().toISOString() }) });
        unsubscribe = subscribeAuditEvents((ev: StoredAuditEvent) => {
          stream.writeSSE({ event: "audit", data: JSON.stringify(ev) }).catch(() => unsubscribe());
        });
        await new Promise<void>((resolve) => {
          stream.onAbort(() => {
            unsubscribe();
            resolve();
          });
        });
      } finally {
        unsubscribe();
      }
    });
  });

  app.post("/kill/:runId", async (c) => {
    const runId = c.req.param("runId");
    const body = (await c.req.json().catch(() => ({}))) as { channel?: string; senderId?: string };
    const channelParsed = ChannelSchema.safeParse(body.channel ?? "web");
    const senderId = body.senderId ?? "web-sandbox";
    const callerUserId = resolveChannelUserId(db, channelParsed.success ? channelParsed.data : "web", senderId);

    const row = db.prepare("SELECT user_id FROM runs WHERE id = ?").get(runId) as { user_id: string } | undefined;
    if (!row || row.user_id !== callerUserId) {
      return c.json({ error: "Run not found for caller" }, 404);
    }
    return c.json(triggerKill(db, runId));
  });

  app.get("/artifacts/:filename", (c) => {
    const filename = c.req.param("filename");
    if (!SAFE_ICS_RE.test(filename)) {
      return c.json({ error: "Invalid artifact filename" }, 400);
    }
    const filePath = join(artifactDir, filename);
    if (!existsSync(filePath)) return c.notFound();
    return c.body(readFileSync(filePath, "utf8"), 200, {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    });
  });

  app.post("/api/sandbox", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { senderId?: string };
    const data = enableJudgeSandbox(db, body.senderId || "web-sandbox");
    return c.json(data);
  });

  app.get("/api/reminders", (c) => {
    const senderId = c.req.query("senderId") || "web-sandbox";
    const userId = resolveChannelUserId(db, "web", senderId);
    const rows = db
      .prepare(
        `SELECT id, title, location_label as locationLabel, event_at as eventAt, notify_at as notifyAt,
                ics_artifact_id as icsArtifactId, status
         FROM reminders WHERE user_id = ? ORDER BY event_at ASC LIMIT 25`
      )
      .all(userId);
    return c.json({ userId, reminders: rows });
  });

  app.get("/api/connections", (c) => {
    const senderId = c.req.query("senderId") || "web-sandbox";
    const userId = resolveChannelUserId(db, "web", senderId);
    return c.json({
      userId,
      connections: listOAuthConnections(db, userId),
      googleOAuthConfigured: Boolean(process.env.GOOGLE_CLIENT_ID),
    });
  });

  app.get("/auth/google", (c) => {
    const senderId = c.req.query("senderId") || "web-sandbox";
    const userId = resolveChannelUserId(db, "web", senderId);
    const url = buildGoogleOAuthUrl(userId);
    if (!url) {
      return c.json({
        configured: false,
        message: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env to enable live Google OAuth, or use Sandbox.",
      }, 200);
    }
    return c.redirect(url);
  });

  app.get("/auth/google/callback", async (c) => {
    const code = c.req.query("code") || "";
    const state = c.req.query("state") || "";
    if (!code || !state) return c.json({ error: "Missing code or state" }, 400);
    const res = await completeGoogleOAuthCallback(db, code, state);
    if (!res.ok) return c.json({ error: res.error }, 400);
    return c.redirect("/?connected=google");
  });

  app.post("/api/debug/tick", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { nowOverride?: string };
    const now = body.nowOverride ? new Date(body.nowOverride) : new Date(Date.now() + 48 * 3600_000);
    if (!Number.isFinite(now.getTime())) {
      return c.json({ error: "Invalid nowOverride timestamp" }, 400);
    }
    const res = await tickHeartbeat(db, defaultHeartbeatDeps, now);
    return c.json({ ...res, alerts: proactiveAlerts.slice(0, 5) });
  });

  app.post("/api/voice-escalate", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { toNumber?: string; message?: string };
    const message = String(body.message || "").trim();
    if (!message) return c.json({ error: "message is required" }, 400);
    const result = await triggerVoiceReminder({ toNumber: body.toNumber, message });
    return c.json(result);
  });

  app.post("/webhooks/telegram", async (c) => {
    const rawBody = await c.req.text();
    if (!telegramAdapter.verifySignature || !(await telegramAdapter.verifySignature(c.req.raw.headers, rawBody))) {
      return c.json({ error: "Invalid Telegram secret token" }, 401);
    }
    let msg;
    try {
      msg = await telegramAdapter.normalize(JSON.parse(rawBody));
    } catch {
      return c.json({ ok: true, ignored: true });
    }
    const result = await runPipeline(db, msg, { artifactDir, traceDir });
    await telegramAdapter.sendReply(msg.senderId, result.reply).catch((e) => console.warn("Telegram reply error:", e));
    return c.json(result);
  });

  app.get("/webhooks/whatsapp", (c) => {
    const mode = c.req.query("hub.mode");
    const token = c.req.query("hub.verify_token") || "";
    const challenge = c.req.query("hub.challenge") || "";
    const expected = process.env.WHATSAPP_VERIFY_TOKEN || "";
    const a = Buffer.from(token, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (mode === "subscribe" && expected && a.length === b.length && timingSafeEqual(a, b)) {
      return c.text(challenge, 200);
    }
    return c.text("Forbidden", 403);
  });

  app.post("/webhooks/whatsapp", async (c) => {
    const rawBody = await c.req.text();
    if (!whatsappAdapter.verifySignature || !(await whatsappAdapter.verifySignature(c.req.raw.headers, rawBody))) {
      return c.json({ error: "Invalid WhatsApp signature" }, 401);
    }
    let msg;
    try {
      msg = await whatsappAdapter.normalize(JSON.parse(rawBody));
    } catch {
      return c.json({ ok: true, ignored: true });
    }
    const result = await runPipeline(db, msg, { artifactDir, traceDir });
    await whatsappAdapter.sendReply(msg.senderId, result.reply).catch(() => {});
    return c.json(result);
  });

  return app;
}
