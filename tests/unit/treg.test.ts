import { describe, it, expect, vi, afterEach } from "vitest";
import { createDb } from "../../src/db/client.js";
import { saveOAuthConnection } from "../../src/auth/vault.js";
import { queryProAnalytics } from "../../src/tools/treg.js";

describe("Treg Pro Analytics Adapter", () => {
  afterEach(() => {
    delete process.env.TREG_TOKEN;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns sandbox analytics when no live Treg token is configured", async () => {
    const db = createDb(":memory:");
    const res = await queryProAnalytics(db, "usr-sandbox", "search_console", "visits this week");
    expect(res.mode).toBe("sandbox");
    expect(res.summary).toContain("Search Console");
    db.close();
  });

  it("calls treg.to with server-side X-Treg-Token from encrypted vault and falls back on HTTP error", async () => {
    const db = createDb(":memory:");
    saveOAuthConnection(db, {
      userId: "usr-pro",
      provider: "treg",
      accessToken: "treg_live_secret_123",
      scopes: "tiktok.read",
    });

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ videos: [{ views: 42000 }] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const live = await queryProAnalytics(db, "usr-pro", "tiktok", "my latest video");
    expect(live.mode).toBe("live_treg");
    expect(mockFetch.mock.calls[0][0]).toBe("https://treg.to/call/anyapi.tiktok.search.videos");
    expect(mockFetch.mock.calls[0][1].headers["X-Treg-Token"]).toBe("treg_live_secret_123");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false, status: 429 }));
    const fallback = await queryProAnalytics(db, "usr-pro", "tiktok", "my latest video");
    expect(fallback.mode).toBe("sandbox");
    expect(fallback.summary).toContain("429");
    db.close();
  });
});
