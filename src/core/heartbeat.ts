import type { DatabaseSync } from "node:sqlite";
import { appendAuditEvent } from "./audit.js";
import { isRunKilled } from "./kill.js";
import type { ActionButton } from "./types.js";

export interface RouteEtaResult {
  durationMinutes: number;
  distanceKm: number;
  mapsUrl: string;
}

export interface WeatherResult {
  tempC: number;
  rainProbability: number;
  summary: string;
}

export interface HeartbeatDeps {
  getRouteEta: (from: { lat: number; lon: number }, to: { lat: number; lon: number }) => Promise<RouteEtaResult | null>;
  getWeather: (lat: number, lon: number) => Promise<WeatherResult | null>;
  notify: (payload: {
    reminderId: string;
    channel: string;
    senderId: string;
    title: string;
    body: string;
    buttons: ActionButton[];
  }) => Promise<void>;
}

interface DueReminderRow {
  id: string;
  user_id: string;
  run_id: string;
  title: string;
  location_label: string | null;
  event_at: string;
  notify_at: string;
  channel: string;
  sender_id: string;
}

interface PlaceRow {
  label: string;
  lat: number;
  lon: number;
}

/**
 * Proactive T-30m heartbeat worker.
 * Finds due scheduled reminders, checks weather + OSRM route ETA, and dispatches
 * an interactive notification asking if the user wants map directions.
 */
export async function tickHeartbeat(
  db: DatabaseSync,
  deps: HeartbeatDeps,
  now = new Date()
): Promise<{ processed: number; reminderIds: string[] }> {
  const due = db
    .prepare(
      `SELECT id, user_id, run_id, title, location_label, event_at, notify_at, channel, sender_id
       FROM reminders
       WHERE status = 'scheduled' AND notify_at <= ?`
    )
    .all(now.toISOString()) as unknown as DueReminderRow[];

  const processedIds: string[] = [];

  for (const rem of due) {
    if (isRunKilled(db, rem.run_id)) continue;

    const home = db
      .prepare("SELECT label, lat, lon FROM saved_places WHERE user_id = ? AND label = 'home'")
      .get(rem.user_id) as PlaceRow | undefined;
    const dest = rem.location_label
      ? (db
          .prepare("SELECT label, lat, lon FROM saved_places WHERE user_id = ? AND label = ?")
          .get(rem.user_id, rem.location_label) as PlaceRow | undefined)
      : undefined;

    let eta: RouteEtaResult | null = null;
    let weather: WeatherResult | null = null;

    if (home && dest) {
      try {
        eta = await deps.getRouteEta({ lat: home.lat, lon: home.lon }, { lat: dest.lat, lon: dest.lon });
      } catch {
        eta = null;
      }
    }
    if (dest) {
      try {
        weather = await deps.getWeather(dest.lat, dest.lon);
      } catch {
        weather = null;
      }
    }

    const etaText = eta
      ? `About ${Math.round(eta.durationMinutes)} mins away (${eta.distanceKm.toFixed(1)} km).`
      : "Live travel time unavailable (set your home/destination in Saved Places for ETA).";
    const weatherText = weather
      ? `Weather: ${weather.tempC}°C, ${weather.rainProbability}% rain (${weather.summary}).`
      : "";
    const body = `${rem.title} starts soon (${rem.event_at}). ${etaText} ${weatherText} Should I open the map to give you directions?`.trim();

    const mapsUrl =
      eta?.mapsUrl ??
      (dest
        ? `https://www.openstreetmap.org/directions?to=${dest.lat},${dest.lon}`
        : "https://www.openstreetmap.org/");

    const buttons: ActionButton[] = [
      { label: "Get Directions", action: "open_map", url: mapsUrl },
      { label: "Snooze 10m", action: `snooze:${rem.id}` },
      { label: "Call Me", action: `call:${rem.id}` },
    ];

    await deps.notify({
      reminderId: rem.id,
      channel: rem.channel,
      senderId: rem.sender_id,
      title: `Annie Reminder: ${rem.title}`,
      body,
      buttons,
    });

    db.prepare("UPDATE reminders SET status = 'notified' WHERE id = ?").run(rem.id);
    appendAuditEvent(db, {
      runId: rem.run_id,
      actor: "system",
      type: "proactive_heartbeat_sent",
      summary: `Dispatched T-30m alert for ${rem.id} (${rem.title})`,
      payload: { reminderId: rem.id, eta, weather },
    });
    processedIds.push(rem.id);
  }

  return { processed: processedIds.length, reminderIds: processedIds };
}
