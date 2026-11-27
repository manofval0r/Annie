# Annie — A Text-First, Proactive Life Admin Agent

> **Agentware 2026 Submission** · Track: **Life Admin** · License: **MIT**

Annie is an open-source, text-first personal agent that completes everyday and professional Life Admin tasks end-to-end across **Web PWA, Telegram, WhatsApp Cloud API, and Mock CLI**—with a **proactive T-30m heartbeat**, **unified cross-channel OAuth**, and **code-enforced safety**.

## Quick Start for Judges (< 5 Minutes, Zero Paid Keys)

```bash
git clone https://github.com/manofval0r/Annie.git
cd Annie
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:3000` for the Web PWA & live `/monitor` dashboard, or run:

```bash
npm run msg -- "Remind me to go to school Tuesday 6pm"
npm run trap          # Run official + custom Trap Pack fixtures
npm run replay -- <runId>
```

* **Zero-Key Mode:** Defaults to `LLM_PROVIDER=mock` (or local `ollama`) and a **1-click Judge Sandbox Mode** for Gmail/Calendar/Search Console.
* **Estimated Test Cost:** `$0.00` (all core APIs—OSRM, Open-Meteo, Overpass, Nager.Date, Frankfurter, OpenFoodFacts, `ntfy.sh`—are keyless).

## Honest Limits
* Outbound payments are hard-disabled (`ALLOW_PAYMENTS=false` in code).
* Public OSRM demo server is rate-limited (~1 req/s); Annie falls back to cached/partial data if throttled.
* See [SAFETY.md](SAFETY.md) for residual risks and [AGENT.md](AGENT.md) for full architecture.
