# AGENT.md — Annie Architecture, Models & Tools

## Track & Identity
* **Track:** `Life Admin` (Agentware 2026)
* **License:** MIT (100% original code written during the Nov 27 – Nov 30, 2026 build window)

## Architecture
1. **Channel Adapters (`src/channels/`):**
   * `telegram.ts`: Fail-closed timing-safe `X-Telegram-Bot-Api-Secret-Token` verification, colon-safe bot token validation, inline buttons.
   * `whatsapp.ts`: Fail-closed Meta `X-Hub-Signature-256` (HMAC-SHA256) verification & official Cloud API replies.
   * `mock-cli.ts`: Terminal simulator (`npm run msg`) exercising the exact orchestrator pipeline.
2. **Unified Auth & Encrypted Token Vault (`src/auth/vault.ts`, `src/core/crypto.ts`):**
   * AES-256-GCM encrypted `oauth_connections` (12-byte random IV, 16-byte auth tag).
   * Collision-safe 6-digit `LINK-XXXXXX` channel linking so Web PWA, Telegram, and WhatsApp share one `userId` and one set of connected integrations—without ever exposing raw OAuth tokens to the LLM.
3. **Policy Chokepoint (`src/core/policy.ts`):** Code-enforced intent allow-list, HTTPS-only SSRF domain allow-list, IPv6/private-IP blocking, `ALLOW_PAYMENTS=false`, `NaN`-safe `MAX_ESTIMATED_COST_USD=0.01`, and `runId`+`userId`-bound single-use `YES <id>` approvals.
4. **Orchestrator (`src/core/orchestrator.ts`) & Sanitiser (`src/core/sanitise.ts`):** Bounded pipeline (`dedupe → sanitise → parse → policy → act → reply`) stripping hidden HTML, scanning base64 payloads, redacting cards/OTPs/API keys, and quarantining prompt injections.
5. **Proactive Heartbeat (`src/core/heartbeat.ts`) & Free Tools (`src/tools/free-apis.ts`, `src/tools/telnyx-voice.ts`, `src/tools/treg.ts`):** Atomically claims due `T-30m` reminders, fetches live OSRM walking ETA + Open-Meteo weather, dispatches `ntfy.sh` JSON alerts or Web PWA prompts, and supports optional Telnyx voice calls (with Browser Web Speech fallback) and Treg Pro analytics.
6. **Audit, Monitor & Kill Switch (`src/core/audit.ts`, `src/core/kill.ts`, `src/app.ts`, `src/cli/replay.ts`):** Append-only SHA-256 hash-chained SQLite/JSONL log, live `/monitor` SSE stream, `POST /kill/:runId` (`AbortController`), and `npm run replay`.

## Models & Stack
* **Runtime:** Node `>= 22.5.0` (tested on Node 24.22.3), TypeScript, Hono, built-in `node:sqlite`, Vitest.
* **LLM Interface (`src/llm/provider.ts`):** Zero-key deterministic `mock` default, local `ollama` (loopback-verified), or HTTPS allow-listed `groq` with 15s timeout and Zod schema validation.
* **Design References (Patterns Only, Not Forked):** `OpenClaw` (heartbeat/cron), `Hermes Agent` (saved user places), `Vellum` (credential isolation + proactive alerts), `biscotti` (secrets gate).
