import type { IntentName, PolicyDecision, ToolRisk } from "./types.js";

export const ALLOWED_INTENTS: ReadonlySet<IntentName> = new Set([
  "schedule_reminder",
  "plan_weekend",
  "triage_renewal",
  "check_status",
  "pro_analytics",
  "link_channel",
  "approve_action",
  "cancel_run",
  "help",
]);

export const ALLOWED_OUTBOUND_HOSTS: ReadonlySet<string> = new Set([
  "router.project-osrm.org",
  "api.openrouteservice.org",
  "nominatim.openstreetmap.org",
  "geocoding-api.open-meteo.com",
  "api.open-meteo.com",
  "air-quality-api.open-meteo.com",
  "overpass-api.de",
  "date.nager.at",
  "api.frankfurter.app",
  "world.openfoodfacts.org",
  "en.wikipedia.org",
  "ntfy.sh",
  "api.telegram.org",
  "graph.facebook.com",
  "treg.to",
  "api.telnyx.com",
  "api.groq.com",
  "generativelanguage.googleapis.com",
]);

const PRIVATE_IP_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^f[cd][0-9a-f]{2}:/i,
  /^fe80:/i,
];

const PAYMENT_TOOLS = new Set(["execute_payment", "stripe_charge", "send_money"]);

export interface PolicyContext {
  runId: string;
  userId: string;
  intent: IntentName;
  estimatedCostUsd: number;
  toolName: string;
  risk: ToolRisk;
  rawArgs: Record<string, unknown>;
  killed: boolean;
  activeApproval: {
    id: string;
    runId: string;
    userId: string;
    action: string;
    used: boolean;
  } | null;
}

export function isUrlAllowed(rawUrl: string): { allowed: boolean; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: "Invalid URL" };
  }

  if (parsed.protocol !== "https:") {
    return { allowed: false, reason: `HTTPS required, got: ${parsed.protocol}` };
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (PRIVATE_IP_PATTERNS.some((re) => re.test(host))) {
    return { allowed: false, reason: `SSRF blocked private host: ${host}` };
  }

  if (!ALLOWED_OUTBOUND_HOSTS.has(host)) {
    return { allowed: false, reason: `Host not in static allow-list: ${host}` };
  }

  return { allowed: true, reason: "Host allow-listed" };
}

export function evaluatePolicy(ctx: PolicyContext): PolicyDecision {
  if (ctx.killed) {
    return { allowed: false, reason: "Run aborted: killed_by_user" };
  }

  if (!ALLOWED_INTENTS.has(ctx.intent)) {
    return { allowed: false, reason: `Intent not allow-listed: ${ctx.intent}` };
  }

  // Hard-coded payment block in demo build
  const allowPayments = process.env.ALLOW_PAYMENTS === "true";
  if (PAYMENT_TOOLS.has(ctx.toolName) && !allowPayments) {
    return {
      allowed: false,
      reason: "Blocked in code: ALLOW_PAYMENTS=false in demo build",
    };
  }

  const rawMax = process.env.MAX_ESTIMATED_COST_USD ?? "0.01";
  const maxCost = Number(rawMax);
  if (!Number.isFinite(maxCost) || maxCost < 0 || !Number.isFinite(ctx.estimatedCostUsd) || ctx.estimatedCostUsd < 0) {
    return { allowed: false, reason: "Invalid cost estimate or MAX_ESTIMATED_COST_USD" };
  }
  if (ctx.estimatedCostUsd > maxCost) {
    return {
      allowed: false,
      requiresApproval: true,
      reason: `Estimated cost $${ctx.estimatedCostUsd.toFixed(4)} exceeds cap $${maxCost}`,
    };
  }

  if (ctx.risk === "irreversible") {
    const validApproval =
      ctx.activeApproval &&
      !ctx.activeApproval.used &&
      ctx.activeApproval.runId === ctx.runId &&
      ctx.activeApproval.userId === ctx.userId &&
      ctx.activeApproval.action === ctx.toolName;
    if (!validApproval) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: `Irreversible action '${ctx.toolName}' requires single-use YES <id> approval`,
      };
    }
  }

  return { allowed: true, reason: "Policy checks passed" };
}
