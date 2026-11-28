import { createDb } from "../db/client.js";
import { runPipeline } from "../core/orchestrator.js";

const text = process.argv.slice(2).join(" ").trim();
if (!text) {
  console.error('Usage: npm run msg -- "Remind me to go to school Tuesday 6pm"');
  process.exit(1);
}

const db = createDb();
try {
  const res = await runPipeline(
    db,
    {
      channel: "mock",
      senderId: "cli-judge",
      text,
      messageId: `cli-${Date.now()}`,
      timestamp: new Date().toISOString(),
    },
    { traceDir: "./traces" }
  );

  console.log(`[Annie · ${res.runId} · ${res.status}]`);
  console.log(res.reply);
  if (res.icsPath) console.log(`Calendar file: ${res.icsPath}`);
  console.log(`Replay trace:  npm run replay -- ${res.runId}`);
} finally {
  db.close();
}
