# Annie — A Text-First, Proactive Life Admin Agent

> **Agentware 2026 Submission** · Track: **Life Admin** · License: **MIT**

Annie is an open-source, text-first personal agent that handles everyday and professional Life Admin tasks across **Web PWA, Telegram, WhatsApp Cloud API, and Mock CLI**—backed by a **proactive T-30m heartbeat**, **unified cross-channel OAuth vault**, and **code-enforced safety**.

## Quick Start for Judges (< 5 Minutes, Zero Paid Keys)

**Requirement:** Node.js `>= 22.5.0` (uses built-in `node:sqlite`, zero C++ build tools required).

```bash
git clone https://github.com/manofval0r/Annie.git
cd Annie
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:3000`:
1. Click **Sandbox** to seed a Judge Sandbox account (Home + School saved; sample Gmail, Search Console, and Treg linked with AES-256-GCM encryption).
2. Send: `Remind me to go to school Tuesday 6pm` — Annie creates a downloadable `.ics` file and arms a proactive T-30m check.
3. Click **Run T-30m Check** — Annie fetches live **OSRM** walking ETA and **Open-Meteo** weather, then offers **Open Directions** and **Call / Speak Alert**.
4. Send a hostile renewal notice or click **Stop Run** to watch code-enforced guardrails and the kill switch live in the **Monitor** pane (`/monitor` SSE).

### CLI Commands

```bash
npm run build                                            # TypeScript typecheck
npm test                                                 # 35 unit & HTTP integration tests
npm run trap                                             # Run Trap Pack -> tests/trap-pack/RESULTS.md
npm run msg -- "Remind me to go to school Tuesday 6pm"   # Mock CLI channel
npm run replay -- <runId>                                # Verify SHA-256 hash chain & replay trace
```

## API Keys & Free Tiers
* **Default Judge Run:** `$0.00` (zero keys required; `LLM_PROVIDER=mock`, built-in `node:sqlite`, keyless OSRM + Open-Meteo + `ntfy.sh`).
* **Optional Free Accelerators (in `.env.example`):** `OLLAMA_BASE_URL` (local), `GROQ_API_KEY`, `TELEGRAM_BOT_TOKEN` + `TELEGRAM_WEBHOOK_SECRET`, `WHATSAPP_*` (Meta Cloud API: 1,000 free service messages/month), `NTFY_TOPIC` (keyless push), `TREG_TOKEN` (`$20` hackathon credits for TikTok/Search Console/AdSense), `TELNYX_API_KEY` (`$25` free voice credits).

## Honest Limits
* Outbound payments are hard-blocked in code (`ALLOW_PAYMENTS=false`).
* Public OSRM demo server is rate-limited (~1 req/s); Annie falls back cleanly if throttled.
* `src/worker.ts` provides a stateless Cloudflare Workers edge entrypoint (`wrangler.toml`); full D1 persistence is documented as an upgrade path.
* See [AGENT.md](AGENT.md) for architecture and [SAFETY.md](SAFETY.md) for guardrails and residual risks.
