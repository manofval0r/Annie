import { z } from "zod";

export const ChannelSchema = z.enum(["web", "telegram", "whatsapp", "mock", "bluebubbles"]);
export type Channel = z.infer<typeof ChannelSchema>;

export const IntentSchema = z.enum([
  "schedule_reminder",
  "plan_weekend",
  "triage_renewal",
  "check_status",
  "pro_analytics",
  "github_check",
  "gmail_check",
  "lookup_info",
  "grocery_check",
  "link_channel",
  "approve_action",
  "cancel_run",
  "help",
]);
export type IntentName = z.infer<typeof IntentSchema>;

export const NormalizedMessageSchema = z.object({
  channel: ChannelSchema,
  senderId: z.string().min(1),
  text: z.string().min(1).max(8192),
  messageId: z.string().min(1),
  timestamp: z.string().min(1),
});
export type NormalizedMessage = z.infer<typeof NormalizedMessageSchema>;

export interface ParsedIntent {
  intent: IntentName;
  confidence: number;
  missingFields?: string[];
  clarifyingQuestion?: string;
  params: Record<string, unknown>;
}

export type ToolRisk = "read" | "reversible" | "irreversible";

export interface ToolContext {
  runId: string;
  userId: string;
  signal: AbortSignal;
  getOAuthToken: (provider: string) => Promise<string | null>;
}

export interface ToolDefinition<TArgs = unknown, TResult = unknown> {
  name: string;
  risk: ToolRisk;
  timeoutMs: number;
  argsSchema: z.ZodType<TArgs>;
  execute: (args: TArgs, ctx: ToolContext) => Promise<TResult>;
}

export interface PolicyDecision {
  allowed: boolean;
  requiresApproval?: boolean;
  reason: string;
}

export interface ActionButton {
  label: string;
  action: string;
  url?: string;
}

export interface ChannelAdapter {
  channel: Channel;
  verifySignature?: (headers: Headers, rawBody: string) => Promise<boolean> | boolean;
  normalize: (rawPayload: unknown) => Promise<NormalizedMessage> | NormalizedMessage;
  sendReply: (senderId: string, text: string, buttons?: ActionButton[]) => Promise<void>;
}
