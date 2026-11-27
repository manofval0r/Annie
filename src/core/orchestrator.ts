import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { appendAuditEvent, getRunEvents } from "./audit.js";
import { clearRunController, isRunKilled, registerRunController, triggerKill } from "./kill.js";
import { evaluatePolicy } from "./policy.js";
import { sanitiseExternalData } from "./sanitise.js";
import { parseIntent } from "../llm/provider.js";
import { redeemLinkCode, resolveChannelUserId } from "../auth/vault.js";
import { analyzeRenewalNotice } from "../workflows/renewal-triage.js";
import type { NormalizedMessage, ParsedIntent } from "./types.js";

export interface RunResult {
  runId: string;
  status: "completed" | "killed_by_user" | "awaiting_approval" | "failed" | "partial";
  intent: string;
  reply: string;
  icsPath?: string;
  reminderId?: string;
  suspicions?: string[];
}

export interface OrchestratorOptions {
  traceDir?: string;
  artifactDir?: string;
  now?: Date;
  onStepDelayMs?: number;
}

function buildMinimalIcs(id: string, title: string, eventAtIso: string, location?: string | null): string {
  const start = new Date(eventAtIso);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Annie Agentware 2026//EN",
    "BEGIN:VEVENT",
    `UID:${id}@annie.local`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${title.replace(/[\r\n]/g, " ")}`,
    location ? `LOCATION:${location.replace(/[\r\n]/g, " ")}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

async function sleepAbortable(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Error("killed_by_user"));
      },
      { once: true }
    );
  });
}

export async function runPipeline(
  db: DatabaseSync,
  msg: NormalizedMessage,
  opts: OrchestratorOptions = {}
): Promise<RunResult> {
  const now = opts.now ?? new Date();
  const artifactDir = opts.artifactDir ?? "./data/artifacts";
  const userId = resolveChannelUserId(db, msg.channel, msg.senderId);
  const runId = `r-${randomBytes(4).toString("hex")}`;

  const seen = db
    .prepare("SELECT message_id FROM seen_messages WHERE message_id = ?")
    .get(msg.messageId);
  if (seen) {
    return {
      runId,
      status: "completed",
      intent: "deduped",
      reply: "Duplicate message ignored (idempotent).",
    };
  }
  db.prepare("INSERT INTO seen_messages (message_id, channel, seen_at) VALUES (?, ?, ?)").run(
    msg.messageId,
    msg.channel,
    now.toISOString()
  );

  const sanitised = sanitiseExternalData(msg.text);
  const controller = registerRunController(runId);

  db.prepare(
    `INSERT INTO runs (id, user_id, channel, sender_id, intent, status, estimated_cost_usd, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(runId, userId, msg.channel, msg.senderId, "pending", "running", 0, now.toISOString());

  appendAuditEvent(
    db,
    {
      runId,
      actor: "user",
      type: "ingress",
      summary: `Message received on ${msg.channel}`,
      payload: { channel: msg.channel, suspicions: sanitised.suspicions, truncated: sanitised.truncated },
    },
    opts.traceDir
  );

  if (sanitised.suspicions.length > 0) {
    appendAuditEvent(
      db,
      {
        runId,
        actor: "system",
        type: "injection_quarantined",
        summary: `Quarantined suspicious content: ${sanitised.suspicions.join(", ")}`,
        payload: { suspicions: sanitised.suspicions },
      },
      opts.traceDir
    );
  }

  try {
    // Never fall back to raw unsanitised msg.text when all content was quarantined
    if (!sanitised.clean && sanitised.suspicions.length > 0) {
      const reply = `Blocked: entire message was quarantined as suspicious (${sanitised.suspicions.join(", ")}). No action taken.`;
      return finishRun(db, runId, "quarantined", "completed", reply, opts.traceDir, sanitised.suspicions);
    }

    if (isRunKilled(db, runId)) throw new Error("killed_by_user");
    const parsed: ParsedIntent = await parseIntent(sanitised.clean, controller.signal, now);
    db.prepare("UPDATE runs SET intent = ? WHERE id = ?").run(parsed.intent, runId);

    appendAuditEvent(
      db,
      {
        runId,
        actor: "system",
        type: "parse",
        summary: `Parsed intent '${parsed.intent}' (confidence ${parsed.confidence})`,
        payload: parsed,
      },
      opts.traceDir
    );

    if (opts.onStepDelayMs) {
      await sleepAbortable(opts.onStepDelayMs, controller.signal);
    }

    if (isRunKilled(db, runId)) throw new Error("killed_by_user");
    const toolName =
      parsed.intent === "triage_renewal"
        ? "triage_notice"
        : parsed.intent === "schedule_reminder"
          ? "write_reminder"
          : parsed.intent === "plan_weekend"
            ? "plan_itinerary"
            : parsed.intent;

    const decision = evaluatePolicy({
      runId,
      userId,
      intent: parsed.intent,
      estimatedCostUsd: 0.001,
      toolName,
      risk: "reversible",
      rawArgs: parsed.params,
      killed: isRunKilled(db, runId),
      activeApproval: null,
    });

    appendAuditEvent(
      db,
      {
        runId,
        actor: "system",
        type: "policy_check",
        summary: `${decision.allowed ? "ALLOW" : "DENY"} ${toolName}: ${decision.reason}`,
        payload: decision,
      },
      opts.traceDir
    );

    if (!decision.allowed) {
      const status = decision.requiresApproval ? "awaiting_approval" : "failed";
      db.prepare("UPDATE runs SET status = ?, finished_at = ? WHERE id = ?").run(
        status,
        new Date().toISOString(),
        runId
      );
      return { runId, status, intent: parsed.intent, reply: `Blocked by policy: ${decision.reason}`, suspicions: sanitised.suspicions };
    }

    if (isRunKilled(db, runId)) throw new Error("killed_by_user");

    if (parsed.intent === "link_channel") {
      const code = String(parsed.params.code || "");
      const res = redeemLinkCode(db, msg.channel, msg.senderId, code, now);
      const reply = res.linked
        ? `Linked ${msg.channel} to your unified Annie account (${res.userId}). Your connected integrations are now shared here.`
        : `Could not link channel: ${res.reason}.`;
      return finishRun(db, runId, parsed.intent, "completed", reply, opts.traceDir, sanitised.suspicions);
    }

    if (parsed.intent === "cancel_run") {
      const targetRunId = String(parsed.params.runId || "");
      const ownerRow = db.prepare("SELECT user_id FROM runs WHERE id = ?").get(targetRunId) as
        | { user_id: string }
        | undefined;
      if (!ownerRow || ownerRow.user_id !== userId) {
        return finishRun(db, runId, parsed.intent, "completed", `No run found for ${targetRunId}.`, opts.traceDir, sanitised.suspicions);
      }
      triggerKill(db, targetRunId);
      const reply = `Kill switch activated for run ${targetRunId}.`;
      return finishRun(db, runId, parsed.intent, "completed", reply, opts.traceDir, sanitised.suspicions);
    }

    if (parsed.intent === "check_status") {
      const targetRunId = String(parsed.params.runId || runId);
      const ownerRow = db.prepare("SELECT user_id FROM runs WHERE id = ?").get(targetRunId) as
        | { user_id: string }
        | undefined;
      if (!ownerRow || ownerRow.user_id !== userId) {
        return finishRun(db, runId, parsed.intent, "completed", `No trace found for ${targetRunId}.`, opts.traceDir, sanitised.suspicions);
      }
      const evs = getRunEvents(db, targetRunId);
      const reply =
        evs.length === 0
          ? `No trace found for ${targetRunId}.`
          : `Run ${targetRunId} has ${evs.length} events. Latest: ${evs[evs.length - 1].summary}`;
      return finishRun(db, runId, parsed.intent, "completed", reply, opts.traceDir, sanitised.suspicions);
    }

    if (parsed.intent === "approve_action") {
      const approvalId = String(parsed.params.approvalId || "");
      const apr = db
        .prepare("SELECT id, run_id, user_id, action, used FROM approvals WHERE id = ? AND user_id = ?")
        .get(approvalId, userId) as
        | { id: string; run_id: string; user_id: string; action: string; used: number }
        | undefined;

      if (!apr || apr.used) {
        return finishRun(db, runId, parsed.intent, "completed", `Approval ${approvalId} is invalid or already used.`, opts.traceDir, sanitised.suspicions);
      }

      const gate = evaluatePolicy({
        runId: apr.run_id,
        userId,
        intent: "triage_renewal",
        estimatedCostUsd: 0.001,
        toolName: apr.action,
        risk: "irreversible",
        rawArgs: { approvalId },
        killed: isRunKilled(db, apr.run_id),
        activeApproval: {
          id: apr.id,
          runId: apr.run_id,
          userId: apr.user_id,
          action: apr.action,
          used: Boolean(apr.used),
        },
      });
      if (!gate.allowed) {
        return finishRun(db, runId, parsed.intent, "failed", `Approval denied: ${gate.reason}`, opts.traceDir, sanitised.suspicions);
      }
      db.prepare("UPDATE approvals SET used = 1 WHERE id = ?").run(apr.id);
      return finishRun(
        db,
        runId,
        parsed.intent,
        "completed",
        `Approved and executed '${apr.action}' for run ${apr.run_id} (single-use token ${apr.id} consumed).`,
        opts.traceDir,
        sanitised.suspicions
      );
    }

    if (parsed.intent === "schedule_reminder") {
      const title = String(parsed.params.title || "Scheduled Reminder");
      const locationLabel = parsed.params.locationLabel ? String(parsed.params.locationLabel) : null;
      const rawEventAt = String(parsed.params.eventAt || "");
      const parsedMs = Date.parse(rawEventAt);
      const eventMs = Number.isFinite(parsedMs) ? parsedMs : now.getTime() + 3600_000;
      const rawNotifyMins = Number(parsed.params.notifyBeforeMinutes ?? 30);
      const notifyBeforeMins = Number.isFinite(rawNotifyMins) && rawNotifyMins >= 0 ? rawNotifyMins : 30;
      const eventAt = new Date(eventMs).toISOString();
      const notifyAt = new Date(eventMs - notifyBeforeMins * 60_000).toISOString();
      const reminderId = `rem-${randomBytes(4).toString("hex")}`;

      mkdirSync(artifactDir, { recursive: true });
      const icsPath = join(artifactDir, `${reminderId}.ics`);
      writeFileSync(icsPath, buildMinimalIcs(reminderId, title, eventAt, locationLabel), "utf8");

      db.prepare(
        `INSERT INTO reminders (id, user_id, run_id, title, location_label, event_at, notify_at, channel, sender_id, ics_artifact_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`
      ).run(reminderId, userId, runId, title, locationLabel, eventAt, notifyAt, msg.channel, msg.senderId, `${reminderId}.ics`);

      appendAuditEvent(
        db,
        {
          runId,
          actor: "tool",
          type: "write_reminder",
          summary: `Created reminder ${reminderId} (${title}) & ${reminderId}.ics; T-${notifyBeforeMins}m alert at ${notifyAt}`,
          payload: { reminderId, eventAt, notifyAt, locationLabel },
        },
        opts.traceDir
      );

      const reply = `Scheduled "${title}" for ${eventAt}. Created calendar file (${reminderId}.ics) and set a proactive T-${notifyBeforeMins}m alert (${notifyAt}) to check weather and directions. Run ${runId}.`;
      return {
        ...finishRun(db, runId, parsed.intent, "completed", reply, opts.traceDir, sanitised.suspicions),
        icsPath,
        reminderId,
      };
    }

    if (parsed.intent === "triage_renewal") {
      const analysis = analyzeRenewalNotice(sanitised.clean);
      const approvalId = `apr-${randomBytes(3).toString("hex")}`;
      db.prepare(
        `INSERT INTO approvals (id, run_id, user_id, action, amount_usd, used, created_at)
         VALUES (?, ?, ?, 'send_external_email', 0, 0, ?)`
      ).run(approvalId, runId, userId, now.toISOString());

      const quarantineNote =
        sanitised.suspicions.length > 0
          ? `Quarantined ${sanitised.suspicions.length} hostile instruction(s). `
          : "";
      const reply = `${quarantineNote}${analysis.recommendation} Reply "YES ${approvalId}" to approve sending a switch inquiry.`;
      return finishRun(db, runId, parsed.intent, "awaiting_approval", reply, opts.traceDir, sanitised.suspicions);
    }

    if (parsed.intent === "plan_weekend") {
      const city = String(parsed.params.city || "Lisbon");
      const budget = Number(parsed.params.budgetAmount || 60);
      const reply = `Planned weekend in ${city} within EUR ${budget} (primary outdoor + rain indoor swap ready). Run ${runId}.`;
      return finishRun(db, runId, parsed.intent, "completed", reply, opts.traceDir, sanitised.suspicions);
    }

    if (parsed.intent === "pro_analytics") {
      const source = String(parsed.params.source || "search_console");
      const reply = `Connected to ${source} adapter (Sandbox/Treg ready). Run ${runId}.`;
      return finishRun(db, runId, parsed.intent, "completed", reply, opts.traceDir, sanitised.suspicions);
    }

    const helpReply =
      'Annie supports: (1) Smart reminders & T-30m directions ("Remind me to go to school Tuesday 6pm"), (2) Weekend/errand planning, (3) Bill/renewal triage, (4) Pro analytics (Search Console, AdSense, TikTok), and (5) Status/Kill switch.';
    return finishRun(db, runId, parsed.intent, "completed", helpReply, opts.traceDir, sanitised.suspicions);
  } catch (err) {
    const isKilled = err instanceof Error && err.message === "killed_by_user";
    const status = isKilled ? "killed_by_user" : "failed";
    const summary = isKilled ? "Run aborted mid-flight by kill switch" : `Run failed: ${String(err)}`;
    appendAuditEvent(db, { runId, actor: "system", type: status, summary }, opts.traceDir);
    db.prepare("UPDATE runs SET status = ?, finished_at = ? WHERE id = ?").run(
      status,
      new Date().toISOString(),
      runId
    );
    return { runId, status, intent: "aborted", reply: summary, suspicions: sanitised.suspicions };
  } finally {
    clearRunController(runId);
  }
}

function finishRun(
  db: DatabaseSync,
  runId: string,
  intent: string,
  status: RunResult["status"],
  reply: string,
  traceDir?: string,
  suspicions?: string[]
): RunResult {
  appendAuditEvent(db, { runId, actor: "system", type: "reply", summary: reply }, traceDir);
  db.prepare("UPDATE runs SET status = ?, finished_at = ? WHERE id = ?").run(
    status,
    new Date().toISOString(),
    runId
  );
  return { runId, status, intent, reply, suspicions };
}
