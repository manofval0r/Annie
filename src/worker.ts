import { Hono } from "hono";
import { analyzeRenewalNotice } from "./workflows/renewal-triage.js";
import { sanitiseExternalData } from "./core/sanitise.js";
import { parseIntentDeterministic } from "./llm/provider.js";

/**
 * Lightweight Cloudflare Workers entrypoint (zero node:sqlite/fs dependencies).
 * shortcut: uses stateless edge handlers; bind D1 when upgrading from local SQLite.
 */
const workerApp = new Hono();

workerApp.get("/health", (c) => c.json({ ok: true, runtime: "cloudflare-workers", service: "annie" }));

workerApp.post("/message", async (c) => {
  const raw = (await c.req.json().catch(() => null)) as { text?: string } | null;
  if (!raw?.text) return c.json({ error: "text is required" }, 400);
  const sanitised = sanitiseExternalData(raw.text);
  if (!sanitised.clean && sanitised.suspicions.length > 0) {
    return c.json({ status: "quarantined", suspicions: sanitised.suspicions });
  }
  const parsed = parseIntentDeterministic(sanitised.clean);
  if (parsed.intent === "triage_renewal") {
    return c.json({ intent: parsed.intent, analysis: analyzeRenewalNotice(sanitised.clean) });
  }
  return c.json({ intent: parsed.intent, params: parsed.params });
});

export default {
  fetch: workerApp.fetch,
  async scheduled(_controller: unknown, _env: unknown, _ctx: unknown) {
    // Cron Trigger hook for D1-backed proactive heartbeat
  },
};
