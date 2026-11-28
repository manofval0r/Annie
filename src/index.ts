import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { tickHeartbeat } from "./core/heartbeat.js";
import { runPipeline } from "./core/orchestrator.js";
import { telegramAdapter } from "./channels/telegram.js";
import { createDb } from "./db/client.js";
import { fetchOpenMeteoWeather, fetchOsrmRouteEta, sendNtfyAlert } from "./tools/free-apis.js";

const port = Number(process.env.PORT || "3000");
const db = createDb();
const app = createApp(db);

// Background T-30m proactive heartbeat loop (every 60s)
const heartbeatTimer = setInterval(() => {
  void tickHeartbeat(db, {
    getRouteEta: (from, to) => fetchOsrmRouteEta(from, to),
    getWeather: (lat, lon) => fetchOpenMeteoWeather(lat, lon),
    notify: async (payload) => {
      if (process.env.NTFY_TOPIC) {
        await sendNtfyAlert(process.env.NTFY_TOPIC, payload);
      }
      if (payload.channel === "telegram") {
        await telegramAdapter.sendReply(payload.senderId, payload.body, payload.buttons);
      }
    },
  }).catch((err) => console.warn("Heartbeat tick error:", err));
}, 60_000);
heartbeatTimer.unref();

// Optional Telegram long-polling (no public webhook URL needed for local dev)
async function startTelegramPolling() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || process.env.TELEGRAM_POLLING !== "true") return;
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
    console.warn("Skipping Telegram polling: invalid TELEGRAM_BOT_TOKEN format");
    return;
  }
  let offset = 0;
  console.log("Telegram long-polling enabled.");
  while (true) {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/getUpdates?timeout=25&offset=${offset}`,
        { signal: AbortSignal.timeout(30_000), redirect: "error" }
      );
      if (res.ok) {
        const data = (await res.json()) as { ok?: boolean; result?: Array<{ update_id: number }> };
        for (const update of data.result ?? []) {
          offset = update.update_id + 1;
          try {
            const msg = await telegramAdapter.normalize(update);
            const result = await runPipeline(db, msg, { traceDir: "./traces" });
            await telegramAdapter.sendReply(msg.senderId, result.reply);
          } catch {
            // ignore non-text updates
          }
        }
      }
    } catch {
      await new Promise((r) => setTimeout(r, 3_000));
    }
  }
}

serve({ fetch: app.fetch, port }, () => {
  console.log(`Annie running on http://localhost:${port}`);
  void startTelegramPolling();
});
