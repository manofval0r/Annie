const MAX_INPUT_BYTES = 8192;

const INJECTION_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: "ignore_instructions", regex: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i },
  { label: "fake_system_role", regex: /(^|\n)\s*(system|assistant)\s*:/i },
  { label: "tool_call_spoof", regex: /\bcall\s+(send_reply|execute_payment|send_external_email)\s*\(/i },
  { label: "prompt_exfil", regex: /repeat\s+(your\s+)?system\s+prompt/i },
  { label: "secret_exfil", regex: /send\s+(all\s+)?(saved\s+)?(secrets|tokens|keys|inbox)\s+to/i },
];

const SECRET_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: "card_number", regex: /\b(?:\d[ -]*?){13,16}\b/g },
  { label: "api_key", regex: /\b(?:sk-[a-zA-Z0-9]{16,}|gho_[a-zA-Z0-9]{16,}|ya29\.[a-zA-Z0-9._-]{16,})\b/g },
  { label: "otp_code", regex: /\b(?:otp|verification\s+code)[:\s#-]*\d{4,8}\b/gi },
];

const HIDDEN_HTML_RE =
  /<([a-z0-9]+)[^>]*style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi;

export interface SanitiseResult {
  clean: string;
  suspicions: string[];
  truncated: boolean;
  redacted: boolean;
}

/**
 * Strips hidden HTML/scripts, enforces 8 KB cap, redacts secrets,
 * and quarantines prompt-injection lines from untrusted external data.
 */
export function sanitiseExternalData(raw: string): SanitiseResult {
  const suspicions: string[] = [];
  let text = raw ?? "";
  let truncated = false;
  let redacted = false;

  if (Buffer.byteLength(text, "utf8") > MAX_INPUT_BYTES) {
    text = Buffer.from(text, "utf8").subarray(0, MAX_INPUT_BYTES).toString("utf8");
    truncated = true;
    suspicions.push("input_truncated");
  }

  const afterHidden = text.replace(HIDDEN_HTML_RE, " ");
  if (afterHidden !== text) {
    suspicions.push("hidden_html_stripped");
    text = afterHidden;
  }
  text = text.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");

  // Decode base64 tokens solely for injection scanning; never execute
  const b64Matches = text.match(/\b[A-Za-z0-9+/]{24,}={0,2}\b/g) ?? [];
  for (const token of b64Matches) {
    try {
      const decoded = Buffer.from(token, "base64").toString("utf8");
      if (INJECTION_PATTERNS.some((p) => p.regex.test(decoded))) {
        suspicions.push("base64_injection_suspected");
        text = text.replace(token, "[QUARANTINED_BASE64]");
      }
    } catch {
      // ignore non-base64
    }
  }

  for (const pat of SECRET_PATTERNS) {
    const next = text.replace(pat.regex, `[REDACTED_${pat.label.toUpperCase()}]`);
    if (next !== text) {
      redacted = true;
      text = next;
    }
  }

  const keptLines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const matched = INJECTION_PATTERNS.find((p) => p.regex.test(line));
    if (matched) {
      suspicions.push(`injection_suspected:${matched.label}`);
    } else {
      keptLines.push(line);
    }
  }

  const clean = keptLines.join("\n").replace(/[ \t]{2,}/g, " ").trim();
  return { clean, suspicions: [...new Set(suspicions)], truncated, redacted };
}
