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

/**
 * Triggers an urgent outbound voice reminder via Telnyx ($25 free credits) when configured,
 * or returns a zero-key Browser Web Speech API fallback payload for judges.
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
      note: "Zero-key fallback: PWA will speak alert via Browser Web Speech API (set TELNYX_API_KEY for PSTN calls).",
    };
  }

  const check = isUrlAllowed(TELNYX_CALLS_URL);
  if (!check.allowed) {
    throw new Error(`SSRF policy blocked voice endpoint: ${check.reason}`);
  }

  const timeoutSignal = AbortSignal.timeout(10_000);
  const combinedSignal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;

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
      note: `Telnyx returned HTTP ${res.status}; fell back to Browser Web Speech API.`,
    };
  }

  const data = (await res.json().catch(() => ({}))) as { data?: { call_control_id?: string } };
  return {
    mode: "telnyx_call",
    dispatched: true,
    spokenText: input.message,
    callControlId: data.data?.call_control_id,
    note: "Outbound Telnyx reminder call initiated.",
  };
}
