import { describe, it, expect, vi, afterEach } from "vitest";
import { analyzeRenewalNotice } from "../../src/workflows/renewal-triage.js";
import { triggerVoiceReminder } from "../../src/tools/telnyx-voice.js";

describe("Renewal Triage & Voice Escalation", () => {
  afterEach(() => {
    delete process.env.TELNYX_API_KEY;
    delete process.env.TELNYX_FROM_NUMBER;
    vi.restoreAllMocks();
  });

  it("detects renewal price jump and recommends switching without spending money", () => {
    const res = analyzeRenewalNotice("Your broadband renewal increases from EUR 45 to EUR 54 per month.");
    expect(res.currency).toBe("EUR");
    expect(res.previousAmount).toBe(45);
    expect(res.newAmount).toBe(54);
    expect(res.percentChange).toBe(20);
    expect(res.recommendation).toContain("+20%");
    expect(res.recommendation).toContain("hard-blocked");
  });

  it("handles notices with no verifiable price honestly", () => {
    const res = analyzeRenewalNotice("Your plan renews next week.");
    expect(res.newAmount).toBeNull();
    expect(res.recommendation).toContain("Could not verify");
  });

  it("falls back cleanly to Browser Web Speech API when Telnyx keys are unset", async () => {
    const res = await triggerVoiceReminder({ message: "School starts in 10 minutes!" });
    expect(res.mode).toBe("web_speech_fallback");
    expect(res.dispatched).toBe(true);
    expect(res.spokenText).toBe("School starts in 10 minutes!");
  });

  it("dispatches Telnyx call when configured and falls back on HTTP failure", async () => {
    process.env.TELNYX_API_KEY = "KEY_TEST";
    process.env.TELNYX_FROM_NUMBER = "+15550001111";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { call_control_id: "v3:call-123" } }),
      })
    );

    const ok = await triggerVoiceReminder({ toNumber: "+15552223333", message: "Leave now" });
    expect(ok.mode).toBe("telnyx_call");
    expect(ok.callControlId).toBe("v3:call-123");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: false, status: 429 }));
    const fallback = await triggerVoiceReminder({ toNumber: "+15552223333", message: "Leave now" });
    expect(fallback.mode).toBe("web_speech_fallback");
    expect(fallback.note).toContain("429");
  });
});
