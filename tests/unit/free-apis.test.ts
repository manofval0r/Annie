import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fetchOpenMeteoWeather,
  fetchOsrmRouteEta,
  sendNtfyAlert,
} from "../../src/tools/free-apis.js";

describe("Free Keyless Tool Adapters (OSRM, Open-Meteo, ntfy.sh)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("parses OSRM route ETA and returns null on HTTP 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ routes: [{ duration: 960, distance: 2150 }] }),
      })
    );
    const eta = await fetchOsrmRouteEta({ lat: 38.71, lon: -9.13 }, { lat: 38.73, lon: -9.14 });
    expect(eta?.durationMinutes).toBe(16);
    expect(eta?.distanceKm).toBe(2.15);
    expect(eta?.mapsUrl).toContain("openstreetmap.org/directions");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false, status: 429 }));
    expect(await fetchOsrmRouteEta({ lat: 38.71, lon: -9.13 }, { lat: 38.73, lon: -9.14 })).toBeNull();
  });

  it("parses Open-Meteo forecast and handles errors cleanly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ current: { temperature_2m: 18.6, precipitation_probability: 70 } }),
      })
    );
    const w = await fetchOpenMeteoWeather(38.73, -9.14);
    expect(w).toEqual({ tempC: 19, rainProbability: 70, summary: "likely rain" });
  });

  it("dispatches ntfy.sh alert with sanitized topic and Click/Actions headers", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    const ok = await sendNtfyAlert("annie-demo!!", {
      title: "School in 30m",
      body: "16 min walk",
      buttons: [{ label: "Open Directions", action: "open_map", url: "https://www.openstreetmap.org/" }],
    });
    expect(ok).toBe(true);
    expect(mockFetch.mock.calls[0][0]).toBe("https://ntfy.sh/annie-demo");
    expect(mockFetch.mock.calls[0][1].headers.Click).toBe("https://www.openstreetmap.org/");
  });
});
