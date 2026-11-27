# AGENT.md — Annie Architecture, Models & Tools

## Track & Identity
* **Track:** `Life Admin` (Agentware 2026)
* **License:** MIT (100% original code written during the Nov 27 – Nov 30, 2026 build window)

## Architecture
1. **Channel Adapters (`src/channels/`):** Normalize Web PWA, Telegram, WhatsApp Cloud API, and Mock CLI messages into `NormalizedMessage` and resolve unified `userId` via `channel_identities`.
2. **Policy Chokepoint (`src/core/policy.ts`):** Code-enforced intent allow-list, SSRF domain allow-list, spend cap (`MAX_ESTIMATED_COST_USD=0.01`), `ALLOW_PAYMENTS=false`, and single-use `YES <id>` approval gate.
3. **Orchestrator (`src/core/orchestrator.ts`):** Bounded state machine (`parse → gather → sanitise → plan → act → reply`) with `AbortController` kill-switch checks before every step.
4. **Proactive Heartbeat (`src/core/heartbeat.ts`):** Wakes up `T-30m` before scheduled reminders, fetches live `Open-Meteo` weather + `OSRM` ETA, and pushes interactive alerts (`ntfy.sh` / Web Push).
5. **Unified Auth & Token Vault (`src/auth/`):** Better Auth (MIT) + AES-256-GCM encrypted `oauth_connections` table. Raw OAuth tokens never enter LLM context.
6. **Audit & Monitor (`src/core/audit.ts`, `src/monitor/`):** Append-only SHA-256 hash-chained event log + live SSE `/monitor` stream + `npm run replay`.

## Models & Stack
* **Runtime:** Node 22.5+ (Node 24 tested), TypeScript, Hono, built-in `node:sqlite` (portable to Cloudflare Workers + D1).
* **LLM Interface:** OpenAI-compatible structured JSON output (`mock` zero-key default, `ollama` `qwen3:4b`, `groq`, `gemini`, `workers-ai`).
* **Design References (Patterns Only, Not Forked):** `OpenClaw` (heartbeat/cron), `Hermes Agent` (user preferences), `Vellum` (credential isolation + proactive alerts), `biscotti` (secrets gate).
