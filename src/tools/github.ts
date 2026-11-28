import type { DatabaseSync } from "node:sqlite";
import { getOAuthToken } from "../auth/vault.js";
import { isUrlAllowed } from "../core/policy.js";
import { sanitiseExternalData } from "../core/sanitise.js";

export interface GitHubSummary {
  mode: "live" | "sandbox";
  summary: string;
}

/**
 * Fetches open notifications or PRs/issues for a repo from GitHub API
 * using the user's encrypted vault token (or GITHUB_TOKEN), sanitising all text.
 */
export async function queryGitHub(
  db: DatabaseSync,
  userId: string,
  repo?: string,
  signal?: AbortSignal
): Promise<GitHubSummary> {
  const vaultToken = getOAuthToken(db, userId, "github");
  if (vaultToken?.startsWith("sandbox_")) {
    return {
      mode: "sandbox",
      summary:
        "GitHub (sandbox): 2 open PRs in manofval0r/Annie (#10 real-integrations, #11 ui-polish), 0 failing checks, 1 unread review mention.",
    };
  }

  const token = vaultToken || process.env.GITHUB_TOKEN || "";
  const cleanRepo = repo && /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo) ? repo : null;

  if (!token && !cleanRepo) {
    return {
      mode: "sandbox",
      summary:
        "GitHub (sandbox): Connect GitHub in Accounts or name a public repo (e.g. 'check github manofval0r/Annie') to fetch live issues and PRs.",
    };
  }

  const url = cleanRepo
    ? `https://api.github.com/repos/${cleanRepo}/issues?state=open&per_page=5`
    : "https://api.github.com/notifications?per_page=5";
  const check = isUrlAllowed(url);
  if (!check.allowed) throw new Error(`SSRF blocked GitHub: ${check.reason}`);

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Annie-Agentware-2026",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const timeoutSignal = AbortSignal.timeout(8_000);
  const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  try {
    const res = await fetch(url, { headers, signal: combined, redirect: "error" });
    if (!res.ok) {
      return {
        mode: "sandbox",
        summary: `GitHub returned HTTP ${res.status}. Connect a valid token in Accounts or check repo visibility.`,
      };
    }
    const items = (await res.json()) as Array<{ number?: number; title?: string; subject?: { title?: string } }>;
    if (!Array.isArray(items) || items.length === 0) {
      return { mode: "live", summary: cleanRepo ? `No open issues or PRs in ${cleanRepo}.` : "No unread GitHub notifications." };
    }
    const lines = items.slice(0, 5).map((it) => {
      const rawTitle = it.title || it.subject?.title || "Untitled";
      const safeTitle = sanitiseExternalData(rawTitle).clean.slice(0, 90);
      return it.number ? `#${it.number} ${safeTitle}` : safeTitle;
    });
    return {
      mode: "live",
      summary: `${cleanRepo ? `GitHub ${cleanRepo}` : "GitHub notifications"} (${items.length}): ${lines.join(" | ")}`,
    };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { mode: "sandbox", summary: "GitHub request failed or timed out; try again shortly." };
  }
}
