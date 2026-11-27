import { describe, it, expect, vi } from "vitest";
import { createDb } from "../../src/db/client.js";
import { runPipeline } from "../../src/core/orchestrator.js";
import { tickHeartbeat } from "../../src/core/heartbeat.js";

describe("Proactive T-30m Heartbeat Scheduler", () => {
  it("wakes up 30 minutes before school reminder and offers live weather + directions", async () => {
    const db = createDb(":memory:");
    const baseNow = new Date("2026-11-30T10:00:00.000Z");

    // Seed saved places for user
    db.prepare(
      "INSERT INTO saved_places (id, user_id, label, address, lat, lon) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("p1", "web:u1", "home", "Home", 38.7223, -9.1393);
    db.prepare(
      "INSERT INTO saved_places (id, user_id, label, address, lat, lon) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("p2", "web:u1", "school", "University", 38.7369, -9.1387);

    const run = await runPipeline(
      db,
      {
        channel: "web",
        senderId: "u1",
        text: "Remind me to go to school on Tuesday, 6pm",
        messageId: "msg-school-1",
        timestamp: baseNow.toISOString(),
      },
      { now: baseNow, artifactDir: "./data/test-artifacts" }
    );
    expect(run.status).toBe("completed");
    expect(run.reminderId).toBeTruthy();

    // Fast-forward to T-25m (past notify_at)
    const remRow = db
      .prepare("SELECT notify_at FROM reminders WHERE id = ?")
      .get(run.reminderId!) as { notify_at: string };
    const wakeTime = new Date(new Date(remRow.notify_at).getTime() + 60_000);

    const notify = vi.fn().mockResolvedValue(undefined);
    const tick = await tickHeartbeat(
      db,
      {
        getRouteEta: async () => ({
          durationMinutes: 16,
          distanceKm: 2.1,
          mapsUrl: "https://www.openstreetmap.org/directions?from=38.7223,-9.1393&to=38.7369,-9.1387",
        }),
        getWeather: async () => ({ tempC: 19, rainProbability: 60, summary: "light rain" }),
        notify,
      },
      wakeTime
    );

    expect(tick.processed).toBe(1);
    expect(notify).toHaveBeenCalledTimes(1);
    const alert = notify.mock.calls[0][0];
    expect(alert.body).toContain("16 mins");
    expect(alert.body).toContain("light rain");
    expect(alert.body).toContain("directions");
    expect(alert.buttons.some((b: { label: string }) => b.label === "Get Directions")).toBe(true);
    db.close();
  });
});
