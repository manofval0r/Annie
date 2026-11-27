import { isUrlAllowed } from "../core/policy.js";

export interface VoiceEscalationInput {
  toNumber?: string;
  message: string;
  signal?: AbortSignal;
}

export interface VoiceEscalationResult {
  mode: "telnyx_call" | "web_speech_fallback";
  dispatched: boolean;
  spokenText: string;
  callControlId?: string;
  note: string;
}

const TELNYX_CALLS_URL = "https://api.telnyx.com/v2/calls";
const E164_RE = /^\+[1-9]\d{6,14}$/;

/**
 * Triggers an urgent outbound voice reminder via Telnyx ($25 free credits) when configured
 * with valid E.164 numbers, or falls back to Browser Web Speech API for zero-key runs.
 */
export async function triggerVoiceReminder(
  input: VoiceEscalationInput
): Promise<VoiceEscalationResult> {
  const apiKey = process.env.TELNYX_API_KEY;
  const fromNumber = process.env.TELNYX_FROM_NUMBER;

  if (!apiKey || !fromNumber || !input.toNumber) {
    return {
      mode: "web_speech_fallback",
      dispatched: true,
      spokenText: input.message,
      note: "Browser Web Speech fallback active (add TELNYX_API_KEY for phone calls).",
    };
  }

  if (!E164_RE.test(fromNumber) || !E164_RE.test(input.toNumber)) {
    return {
      mode: "web_speech_fallback",
      dispatched: true,
      spokenText: input.message,
      note: "Phone number must be E.164 (+15551234567); fell back to Browser Web Speech.",
    };
  }

  const check = isUrlAllowed(TELNYX_CALLS_URL);
  if (!check.allowed) {
    throw new Error(`SSRF policy blocked voice endpoint: ${check.reason}`);
  }

  const timeoutSignal = AbortSignal.timeout(10_000);
  const combinedSignal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;

  try {
    // shortcut: Telnyx Call Control v2 create-call; upgrade to webhook speak-on-answer for two-way voice
    const res = await fetch(TELNYX_CALLS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        connection_id: process.env.TELNYX_CONNECTION_ID || "annie-voice",
        to: input.toNumber,
        from: fromNumber,
        client_state: Buffer.from(input.message.slice(0, 200), "utf8").toString("base64"),
      }),
      signal: combinedSignal,
      redirect: "error",
    });

    if (!res.ok) {
      return {
        mode: "web_speech_fallback",
        dispatched: true,
        spokenText: input.message,
        note: `Telnyx returned HTTP ${res.status}; fell back to Browser Web Speech.`,
      };
    }

    const data = (await res.json().catch(() => ({}))) as { data?: { call_control_id?: string } };
    return {
      mode: "telnyx_call",
      dispatched: true,
      spokenText: input.message,
      callControlId: data.data?.call_control_id,
      note: "Outbound reminder call placed via Telnyx.",
    };
  } catch (err) {
    if (input.signal?.aborted) throw err;
    return {
      mode: "web_speech_fallback",
      dispatched: true,
      spokenText: input.message,
      note: "Telnyx request timed out or failed; fell back to Browser Web Speech.",
    };
  }
}
