import { describe, it, expect } from "vitest";
import { createDb } from "../../src/db/client.js";
import { appendAuditEvent, verifyHashChain } from "../../src/core/audit.js";
import { triggerKill } from "../../src/core/kill.js";
import { runPipeline } from "../../src/core/orchestrator.js";

describe("Hash-Chain Audit & Mid-Flight Kill Switch", () => {
  it("verifies an untampered SHA-256 chain and detects tampering", () => {
    const db = createDb(":memory:");
    appendAuditEvent(db, { runId: "r-test", actor: "user", type: "ingress", summary: "Hello" });
    appendAuditEvent(db, { runId: "r-test", actor: "system", type: "parse", summary: "Parsed" });

    expect(verifyHashChain(db, "r-test")).toEqual({ valid: true, count: 2 });

    // Tamper with summary in SQLite
    db.prepare("UPDATE events SET summary = 'Tampered!' WHERE run_id = 'r-test' AND seq = 1").run();
    const check = verifyHashChain(db, "r-test");
    expect(check.valid).toBe(false);
    expect(check.brokenAtSeq).toBe(1);
    db.close();
  });

  it("aborts an in-flight run immediately when kill switch is pressed", async () => {
    const db = createDb(":memory:");
    const runPromise = runPipeline(
      db,
      {
        channel: "web",
        senderId: "judge-1",
        text: "Remind me to go to school Tuesday 6pm",
        messageId: "msg-kill-1",
        timestamp: new Date().toISOString(),
      },
      { onStepDelayMs: 500, artifactDir: "./data/test-artifacts" }
    );

    // Wait briefly so run starts, then pull the runId from SQLite and kill it
    await new Promise((r) => setTimeout(r, 40));
    const row = db.prepare("SELECT id FROM runs LIMIT 1").get() as { id: string };
    triggerKill(db, row.id);

    const result = await runPromise;
    expect(result.status).toBe("killed_by_user");
    expect(verifyHashChain(db, result.runId).valid).toBe(true);
    db.close();
  });
});
