import { isUrlAllowed } from "../core/policy.js";
import type { RouteEtaResult, WeatherResult } from "../core/heartbeat.js";
import type { ActionButton } from "../core/types.js";

function combineSignal(signal?: AbortSignal, timeoutMs = 8_000): AbortSignal {
  const t = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, t]) : t;
}

/**
 * Fetches driving/walking ETA from public keyless OSRM demo server.
 * Enforces SSRF allow-list, 8s timeout, and redirect: "error".
 */
export async function fetchOsrmRouteEta(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  signal?: AbortSignal
): Promise<RouteEtaResult | null> {
  const url = `https://router.project-osrm.org/route/v1/foot/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
  const check = isUrlAllowed(url);
  if (!check.allowed) throw new Error(`SSRF blocked OSRM: ${check.reason}`);

  const mapsUrl = `https://www.openstreetmap.org/directions?from=${from.lat},${from.lon}&to=${to.lat},${to.lon}`;
  try {
    const res = await fetch(url, { signal: combineSignal(signal), redirect: "error" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      routes?: Array<{ duration?: number; distance?: number }>;
    };
    const route = data.routes?.[0];
    if (!route || typeof route.duration !== "number" || typeof route.distance !== "number") {
      return null;
    }
    return {
      durationMinutes: Math.max(1, Math.round(route.duration / 60)),
      distanceKm: Number((route.distance / 1000).toFixed(2)),
      mapsUrl,
    };
  } catch (err) {
    if (signal?.aborted) throw err;
    return null;
  }
}

/**
 * Fetches current temperature and precipitation probability from keyless Open-Meteo.
 */
export async function fetchOpenMeteoWeather(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<WeatherResult | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation_probability&forecast_days=1`;
  const check = isUrlAllowed(url);
  if (!check.allowed) throw new Error(`SSRF blocked Open-Meteo: ${check.reason}`);

  try {
    const res = await fetch(url, { signal: combineSignal(signal), redirect: "error" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      current?: { temperature_2m?: number; precipitation_probability?: number };
    };
    const tempC = data.current?.temperature_2m;
    const rainProb = data.current?.precipitation_probability ?? 0;
    if (typeof tempC !== "number") return null;
    const summary = rainProb >= 50 ? "likely rain" : rainProb >= 20 ? "chance of rain" : "mostly dry";
    return { tempC: Math.round(tempC), rainProbability: Math.round(rainProb), summary };
  } catch (err) {
    if (signal?.aborted) throw err;
    return null;
  }
}

/**
 * Sends a proactive push notification via keyless ntfy.sh with interactive Click/Action headers.
 */
export async function sendNtfyAlert(
  topic: string,
  payload: { title: string; body: string; buttons?: ActionButton[] },
  signal?: AbortSignal
): Promise<boolean> {
  const cleanTopic = topic.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!cleanTopic) return false;
  const url = `https://ntfy.sh/${cleanTopic}`;
  const check = isUrlAllowed(url);
  if (!check.allowed) throw new Error(`SSRF blocked ntfy: ${check.reason}`);

  const dirUrl = payload.buttons?.find((b) => b.url?.startsWith("https://"))?.url;
  const headers: Record<string, string> = {
    Title: payload.title.slice(0, 120),
    Priority: "high",
  };
  if (dirUrl) {
    headers.Click = dirUrl;
    headers.Actions = `view, Open Directions, ${dirUrl}`;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: payload.body,
      signal: combineSignal(signal),
      redirect: "error",
    });
    return res.ok;
  } catch (err) {
    if (signal?.aborted) throw err;
    return false;
  }
}
