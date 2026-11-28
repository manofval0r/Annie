import { isUrlAllowed } from "../core/policy.js";
import { fetchOpenMeteoWeather, fetchOsrmRouteEta } from "./free-apis.js";

export interface WeekendPlanResult {
  city: string;
  summary: string;
  partial: boolean;
}

/**
 * Live weather-aware weekend/errand planner using keyless Open-Meteo Geocoding,
 * Open-Meteo Forecast, and OSRM walking times — with curated offline fallback if rate-limited.
 */
export async function buildWeekendPlan(
  city: string,
  budgetEur: number,
  people: number,
  signal?: AbortSignal
): Promise<WeekendPlanResult> {
  const cleanCity = city.trim().slice(0, 40) || "Lisbon";
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanCity)}&count=1&language=en&format=json`;
  let lat = 38.7223;
  let lon = -9.1393;
  let resolvedName = cleanCity;
  let partial = false;

  try {
    if (isUrlAllowed(geoUrl).allowed) {
      const res = await fetch(geoUrl, { signal: signal ?? AbortSignal.timeout(8_000), redirect: "error" });
      if (res.ok) {
        const data = (await res.json()) as { results?: Array<{ name: string; latitude: number; longitude: number }> };
        if (data.results?.[0]) {
          resolvedName = data.results[0].name;
          lat = data.results[0].latitude;
          lon = data.results[0].longitude;
        }
      } else {
        partial = true;
      }
    }
  } catch (err) {
    if (signal?.aborted) throw err;
    partial = true;
  }

  const weather = await fetchOpenMeteoWeather(lat, lon, signal);
  if (!weather) partial = true;

  const eta = await fetchOsrmRouteEta(
    { lat, lon },
    { lat: lat + 0.012, lon: lon + 0.008 },
    signal
  );

  const perPerson = Math.max(5, Math.floor((budgetEur * 0.6) / Math.max(1, people)));
  const rainSwap = weather && weather.rainProbability >= 50;
  const walkNote = eta ? `${eta.durationMinutes} min walk (${eta.distanceKm} km)` : "central walk";
  const weatherLine = weather
    ? `${weather.tempC}°C, ${weather.rainProbability}% rain (${weather.summary})`
    : "weather unavailable (partial plan)";

  const afternoonStop = rainSwap
    ? `15:00 Indoor museum/gallery swap (rain expected: ${weatherLine})`
    : `15:00 City park & viewpoint (${walkNote})`;

  const summary = `${resolvedName} for ${people}, budget EUR ${budgetEur} (${weatherLine}). 10:00 Morning walk in historic center (free); 12:30 Lunch (~EUR ${perPerson} each); ${afternoonStop}.`;
  return { city: resolvedName, summary, partial };
}
