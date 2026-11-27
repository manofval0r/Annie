import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

export interface AuditEventInput {
  runId: string;
  actor: "user" | "system" | "tool";
  type: string;
  summary: string;
  payload?: unknown;
}

export interface StoredAuditEvent {
  runId: string;
  seq: number;
  ts: string;
  actor: string;
  type: string;
  summary: string;
  payloadHash: string;
  prevHash: string;
  hash: string;
}

type EventListener = (event: StoredAuditEvent) => void;
const listeners = new Set<EventListener>();

export function subscribeAuditEvents(fn: EventListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function computeEventHash(e: Omit<StoredAuditEvent, "hash">): string {
  return sha256(
    `${e.runId}|${e.seq}|${e.ts}|${e.actor}|${e.type}|${e.summary}|${e.payloadHash}|${e.prevHash}`
  );
}

export function appendAuditEvent(
  db: DatabaseSync,
  input: AuditEventInput,
  traceDir?: string
): StoredAuditEvent {
  const last = db
    .prepare("SELECT seq, hash FROM events WHERE run_id = ? ORDER BY seq DESC LIMIT 1")
    .get(input.runId) as { seq: number; hash: string } | undefined;

  const seq = last ? last.seq + 1 : 1;
  const prevHash = last ? last.hash : "GENESIS";
  const ts = new Date().toISOString();
  const payloadHash = sha256(JSON.stringify(input.payload ?? {}));

  const base = {
    runId: input.runId,
    seq,
    ts,
    actor: input.actor,
    type: input.type,
    summary: input.summary,
    payloadHash,
    prevHash,
  };
  const hash = computeEventHash(base);
  const full: StoredAuditEvent = { ...base, hash };

  db.prepare(
    `INSERT INTO events (run_id, seq, ts, actor, type, summary, payload_hash, prev_hash, hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    full.runId,
    full.seq,
    full.ts,
    full.actor,
    full.type,
    full.summary,
    full.payloadHash,
    full.prevHash,
    full.hash
  );

  if (traceDir) {
    mkdirSync(traceDir, { recursive: true });
    appendFileSync(join(traceDir, `${full.runId}.jsonl`), `${JSON.stringify(full)}\n`, "utf8");
  }

  for (const fn of listeners) {
    try {
      fn(full);
    } catch {
      // keep audit append resilient to SSE client disconnects
    }
  }

  return full;
}

export function getRunEvents(db: DatabaseSync, runId: string): StoredAuditEvent[] {
  const rows = db
    .prepare(
      `SELECT run_id as runId, seq, ts, actor, type, summary, payload_hash as payloadHash,
              prev_hash as prevHash, hash
       FROM events WHERE run_id = ? ORDER BY seq ASC`
    )
    .all(runId) as unknown as StoredAuditEvent[];
  return rows;
}

export function verifyHashChain(
  db: DatabaseSync,
  runId: string
): { valid: boolean; count: number; brokenAtSeq?: number } {
  const rows = getRunEvents(db, runId);
  let expectedPrev = "GENESIS";
  let expectedSeq = 1;

  for (const row of rows) {
    if (row.seq !== expectedSeq || row.prevHash !== expectedPrev) {
      return { valid: false, count: rows.length, brokenAtSeq: row.seq };
    }
    const expectedHash = computeEventHash({
      runId: row.runId,
      seq: row.seq,
      ts: row.ts,
      actor: row.actor,
      type: row.type,
      summary: row.summary,
      payloadHash: row.payloadHash,
      prevHash: row.prevHash,
    });
    if (row.hash !== expectedHash) {
      return { valid: false, count: rows.length, brokenAtSeq: row.seq };
    }
    expectedPrev = row.hash;
    expectedSeq += 1;
  }

  return { valid: true, count: rows.length };
}
