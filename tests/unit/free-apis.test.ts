import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fetchOpenMeteoWeather,
  fetchOsrmRouteEta,
  sendNtfyAlert,
} from "../../src/tools/free-apis.js";

describe("Free Keyless Tool Adapters (OSRM, Open-Meteo, ntfy.sh)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects out-of-range coordinates without calling fetch", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await fetchOsrmRouteEta({ lat: 999, lon: 0 }, { lat: 38.7, lon: -9.1 })).toBeNull();
    expect(await fetchOpenMeteoWeather(Number.NaN, -9.1)).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

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

  it("parses Open-Meteo forecast and returns null on HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ current: { temperature_2m: 18.6, precipitation_probability: 70 } }),
      })
    );
    expect(await fetchOpenMeteoWeather(38.73, -9.14)).toEqual({
      tempC: 19,
      rainProbability: 70,
      summary: "likely rain",
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false, status: 503 }));
    expect(await fetchOpenMeteoWeather(38.73, -9.14)).toBeNull();
  });

  it("publishes ntfy.sh JSON safely with comma-containing mapsUrl and stripped topic", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    const mapsUrl = "https://www.openstreetmap.org/directions?from=38.71,-9.13&to=38.73,-9.14";
    const ok = await sendNtfyAlert("annie-demo!!", {
      title: "School\r\nin 30m",
      body: "16 min walk",
      buttons: [{ label: "Open Directions", action: "open_map", url: mapsUrl }],
    });
    expect(ok).toBe(true);
    expect(mockFetch.mock.calls[0][0]).toBe("https://ntfy.sh/");
    const sent = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(sent.topic).toBe("annie-demo");
    expect(sent.title).toBe("School in 30m");
    expect(sent.actions[0].url).toBe(mapsUrl);
    expect(await sendNtfyAlert("!!!", { title: "x", body: "y" })).toBe(false);
  });
});
