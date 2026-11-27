import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createDb } from "./db/client.js";

const port = Number(process.env.PORT || "3000");
const db = createDb();
const app = createApp(db);

serve({ fetch: app.fetch, port }, () => {
  console.log(`Annie running on http://localhost:${port}`);
});
