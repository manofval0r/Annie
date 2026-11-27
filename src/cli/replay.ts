import { createDb } from "../db/client.js";
import { getRunEvents, verifyHashChain } from "../core/audit.js";

const runId = process.argv[2];
if (!runId) {
  console.error("Usage: npm run replay -- <runId>");
  process.exit(1);
}

const db = createDb();
const events = getRunEvents(db, runId);
if (events.length === 0) {
  console.error(`No audit events found for runId: ${runId}`);
  db.close();
  process.exit(1);
}

const check = verifyHashChain(db, runId);
console.log(`=== Annie Audit Replay: ${runId} ===`);
for (const ev of events) {
  console.log(`[#${ev.seq}] ${ev.ts} (${ev.actor}) ${ev.type}: ${ev.summary}`);
}
console.log(`Chain valid: ${check.valid} (${check.count} events)`);
db.close();
if (!check.valid) process.exit(2);
