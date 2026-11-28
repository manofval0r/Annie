import type { DatabaseSync } from "node:sqlite";
import { getOAuthToken } from "../auth/vault.js";
import { isUrlAllowed } from "../core/policy.js";
import { sanitiseExternalData } from "../core/sanitise.js";

export type ProAnalyticsSource = "search_console" | "adsense" | "tiktok";

export interface ProAnalyticsResult {
  source: ProAnalyticsSource;
  mode: "live_treg" | "sandbox";
  summary: string;
}

const TREG_ENDPOINT_MAP: Record<ProAnalyticsSource, string> = {
  tiktok: "anyapi.tiktok.search.videos",
  search_console: "google.search_console.query",
  adsense: "google.adsense.reports",
};

const SANDBOX_SUMMARIES: Record<ProAnalyticsSource, string> = {
  search_console:
    "Search Console (sandbox): 1,420 clicks (+14% vs last week), 38,200 impressions. Top query: 'annie agent' (310 clicks).",
  adsense:
    "AdSense (sandbox): EUR 42.80 estimated over the last 7 days (+9%), RPM EUR 6.15 across 6,960 page views.",
  tiktok:
    "TikTok (sandbox): Latest 3 posts averaged 18,400 views, 1,120 likes, and 94 shares (6.1% engagement rate).",
};

/**
 * Queries Treg (treg.to) for Pro/Creator analytics using server-side token injection.
 * Sanitises external payloads before returning and falls back to Sandbox summaries when unconfigured.
 */
export async function queryProAnalytics(
  db: DatabaseSync,
  userId: string,
  source: ProAnalyticsSource,
  query: string,
  signal?: AbortSignal
): Promise<ProAnalyticsResult> {
  const vaultToken = getOAuthToken(db, userId, "treg");
  if (vaultToken?.startsWith("sandbox_")) {
    return { source, mode: "sandbox", summary: SANDBOX_SUMMARIES[source] };
  }
  const token = vaultToken || process.env.TREG_TOKEN || "";
  if (!token) {
    return { source, mode: "sandbox", summary: SANDBOX_SUMMARIES[source] };
  }

  const endpoint = TREG_ENDPOINT_MAP[source];
  const url = `https://treg.to/call/${endpoint}`;
  const check = isUrlAllowed(url);
  if (!check.allowed) throw new Error(`SSRF blocked Treg: ${check.reason}`);

  const timeoutSignal = AbortSignal.timeout(8_000);
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Treg-Token": token,
      },
      body: JSON.stringify({ query }),
      signal: combinedSignal,
      redirect: "error",
    });

    if (!res.ok) {
      return {
        source,
        mode: "sandbox",
        summary: `Treg returned HTTP ${res.status}; showing cached baseline. ${SANDBOX_SUMMARIES[source]}`,
      };
    }

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const clean = sanitiseExternalData(JSON.stringify(data)).clean.slice(0, 240);
    return {
      source,
      mode: "live_treg",
      summary: `Live Treg (${endpoint}): ${clean}`,
    };
  } catch (err) {
    if (signal?.aborted) throw err;
    const reason = err instanceof Error && err.name === "TimeoutError" ? "timed out" : "failed";
    return {
      source,
      mode: "sandbox",
      summary: `Treg request ${reason}; showing cached baseline. ${SANDBOX_SUMMARIES[source]}`,
    };
  }
}
