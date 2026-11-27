import type { DatabaseSync } from "node:sqlite";

const activeControllers = new Map<string, AbortController>();

export function registerRunController(runId: string): AbortController {
  const controller = new AbortController();
  activeControllers.set(runId, controller);
  return controller;
}

export function clearRunController(runId: string): void {
  activeControllers.delete(runId);
}

export function isRunKilled(db: DatabaseSync, runId: string): boolean {
  const controller = activeControllers.get(runId);
  if (controller?.signal.aborted) return true;
  const row = db.prepare("SELECT run_id FROM kill_flags WHERE run_id = ?").get(runId);
  return Boolean(row);
}

/**
 * Immediately marks a run as killed in SQLite and aborts any in-flight fetches.
 */
export function triggerKill(db: DatabaseSync, runId: string): { killed: boolean; runId: string } {
  db.prepare("INSERT OR IGNORE INTO kill_flags (run_id, killed_at) VALUES (?, ?)").run(
    runId,
    new Date().toISOString()
  );
  const controller = activeControllers.get(runId);
  if (controller && !controller.signal.aborted) {
    controller.abort("killed_by_user");
  }
  return { killed: true, runId };
}
