# Deep Research Report & Master Plan: **Annie** for Agentware 2026

**Date:** November 27, 2026 (Code Freeze: November 30, 2026, 18:00 UTC)  
**Repository:** [Manofval0r/annie](https://github.com/Manofval0r/annie) (Public, MIT License)  
**Target Event:** [Agentware 2026 by Hackathon Raptors](https://agentwarehack.com/brief/)  
**Recommended Track:** **Life Admin** (Primary) | **Open Track** (Fallback)

---

## 1. Executive Summary & Direct Answers

This report overhauls the original "Relay" PRD into **Annie**—a text-first, proactive, cross-platform personal agent that executes real tasks across **Web PWA, WhatsApp, Telegram, and optional iMessage/Voice**, backed by a **unified cross-channel OAuth & Token Vault** and **code-enforced safety**.

### Key Verdicts from Deep Research
1. **Keenable & PigeonRelay — Are they actually needed?**
   * **Keenable (`keenable.ai`): NOT needed for core.** Annie relies on structured, deterministic APIs (OSRM, Open-Meteo, Google/Microsoft APIs, Treg) rather than open-ended web scraping. Standard `fetch` + `readability` covers basic page reads without adding another external dependency. *(Verdict: Skip for MVP; `Can Have` only).*
   * **PigeonRelay (`pigeonrelay.ai`): NOT needed for core.** PigeonRelay solves *agent-to-agent* messaging between two different users. Annie's core differentiator is **one user reaching their own Annie across any channel with shared auth and state**. *(Verdict: Skip for MVP; `Can Have` only).*
   * **Treg (`treg.to`): YES — High Value (`Should Have`).** Treg acts as an "OpenRouter for 4,200+ APIs" behind one `X-Treg-Token` and MCP endpoint (`https://treg.to/mcp`), with server-side credential injection. Crucially, it supports **unmetered BYOK for Google Search Console / Google Analytics / Google Ads** AND metered **TikTok** (`anyapi.tiktok.search.videos`, `justoneapi.tiktok.search.videos`, `tikhub.tiktok.search.videos`), SEO, and Ad Transparency APIs using your **$20 free credits**.
2. **`bilawalsidhu/gods-eye-view` — Can we use it for Maps/Routing?**
   * **Verdict: NO.** God's Eye View is a heavy **CesiumJS 3D OSINT "spy-satellite" globe** (flights, AIS ships, satellites, wildfires), not a turn-by-turn commute/directions engine. Furthermore, while its code is MIT, its bundled datasets carry **CC BY-NC-SA (Non-Commercial)** licenses and rely on Google 3D Tiles.
   * **What to use instead:** **OSRM** (`router.project-osrm.org`, keyless) + **OpenRouteService** (free tier) + **Nominatim/Overpass** + **Open-Meteo** + **Leaflet** (all commercial-safe, lightweight, and fast).
3. **Unified Cross-Channel Auth ("Connect Gmail/Outlook once on Web → use on Mobile, WhatsApp, Telegram"):**
   * Yes! Use **Better Auth (100% MIT)** + an **AES-256-GCM Encrypted Token Vault** + a **Channel Linking Table** (`LINK-XXXXXX` one-time code). Authenticate Gmail/Outlook/Search Console once on the Web PWA, link your WhatsApp/Telegram ID, and every channel shares the exact same `user_id` and integrations—while keeping raw OAuth tokens **completely out of LLM context**.

---

## 2. Hackathon Criteria, Track Selection & Winning Strategy

### 2.1 Scoring Rubric
| Criterion | Weight | What Judges Verify | Annie's Winning Evidence |
|---|---|---|---|
| **Autonomy** | **30%** | Unattended trigger-to-result; zero human mid-loop unless gating irreversible actions. | Reactive 1-shot execution **AND** proactive **T-30m heartbeat** (weather + OSRM ETA + push notification + directions). |
| **Usefulness** | **25%** | Real chore someone hands over; live data; narrow & finished beats broad & broken. | 4 everyday + pro Life Admin workflows (Smart Calendar/Commute, Errand Planner, Bill/Renewal Triage, Pro Analytics via Treg). |
| **Reliability** | **20%** | Trap Pack results in `tests/`; clean handling of bad data, API failures, and injections. | Automated Trap Pack runner (`RESULTS.md`), schema-enforced LLM output, cached fallbacks, idempotent `runId`. |
| **Engineering** | **15%** | <15 min setup with zero judge credentials; clean architecture; accurate `AGENT.md`. | `npm install && npm run dev` (or Docker) works out of the box with **1-click Judge Sandbox Mode** + zero-key APIs. |
| **Demo** | **10%** | ≤3 min unlisted video showing unattended run, injection block, kill switch, replay. | Split-screen: Web/Telegram/PWA on left, `/monitor` SSE + Kill Switch on right. |
| **Safety Bonus** | **+4 pts** | Code Guardrails (+1), Live Monitor (+1), Kill Switch (+1), Audit Trail (+1). | `policy.ts` chokepoint, `/monitor` SSE, `POST /kill/:runId` (`AbortController`), SHA-256 hash-chain + `npm run replay`. |

### 2.2 Best Track
* **Life Admin (Primary):** Covers scheduling, reminders, commute, bills/renewals, and daily errands.
* **Partner Opt-Ins:** **Treg Challenge** ($500 / $250 / $100 — opt in by **Nov 28**), **Graphify** (optional code map), **The Near Miss** (3 × $100 write-up, closes Dec 7).

---

## 3. Unified Cross-Channel Auth & Integration Architecture

To satisfy *"authenticate Gmail/Outlook once on Web → fetch mails or check calendar from Mobile PWA, WhatsApp, or Telegram"*:

```text
[Web PWA Login] ---> Better Auth (MIT) ---> user_id (e.g. usr_01)
                                               |
      +----------------------------------------+----------------------------------------+
      |                                        |                                        |
      v                                        v                                        v
[OAuth Connections Vault]             [Channel Linking Table]                [Judge Sandbox Mode]
- Google (Gmail, Cal, GSC, AdSense)   - (web, session_id)   -> usr_01        - 1-click demo user
- Microsoft (Outlook Mail/Cal)        - (telegram, chat_id) -> usr_01        - Seeded mock Gmail,
- Treg (X-Treg-Token)                 - (whatsapp, phone)   -> usr_01          Calendar & GSC data
  (AES-256-GCM encrypted at rest)       (Linked via 6-digit LINK-XXXXXX)       (Zero keys needed)
```

* **Security Boundary (Secrets Gate):** Adapted from **Vellum (MIT)** and **Biscotti**—the LLM never receives OAuth access/refresh tokens. Tools receive `user_id`, `policy.ts` checks scope & approval rules, and the tool runtime decrypts and attaches the `Authorization: Bearer` header server-side.

---

## 4. "Banger" APIs & Treg Pro Capabilities

### 4.1 Core Zero-Key / Free-Tier APIs (Always Works for Judges)
* **Routing & Directions:** **OSRM** (`router.project-osrm.org`, no key) + **OpenRouteService** (free tier) + **Nominatim/Overpass** (OSM POIs).
* **Weather & Context:** **Open-Meteo** (Forecast + AQI, no key) + **Nager.Date** (public holidays, no key) + **Frankfurter** (ECB FX rates, no key) + **OpenFoodFacts** (grocery/nutrition, no key).
* **Proactive Push & Mobile App:** **Installable PWA** + **Web Push (VAPID)** + **`ntfy.sh`** (HTTP POST notifications with interactive action buttons: *Get Directions*, *Snooze 10m*, *Call Me*).
* **Calendar:** Universal **RFC 5545 `.ics`** + **CalDAV** (Apple/Nextcloud) + optional Google/Outlook OAuth.
* **Voice Escalation:** Zero-key **Browser Web Speech API** fallback + optional **Telnyx** (`$25` free credit, no CC) / **Vapi** (`$5` free credit).

### 4.2 Treg `$20` Pro/Creator Integrations (`Should Have`)
With Treg (`https://treg.to/llms.txt` / `https://treg.to/mcp`), Annie unlocks professional & creator workflows:
1. **Google Search Console (Unmetered BYOK):** *"How many visits and top queries did my site get this week?"*
2. **Google Analytics & AdSense (Connected Google OAuth):** Traffic trends, top pages, and revenue snapshots.
3. **TikTok Analytics (`anyapi.tiktok.search.videos`, `justoneapi.tiktok.search.videos`, `tikhub.tiktok.search.videos`):** Pull video views, likes, comments, shares, and creator stats.
4. **Competitor Ad & SEO Intelligence (`adyntel.google.ads.transparency`, Moz, Semrush):** Research competitor ads or domain metrics on demand.

---

## 5. Recommended Tech Stack & Free-Forever Hosting

| Layer | Choice | Why | Free-Forever Hosting |
|---|---|---|---|
| **Runtime & API** | **Node 22 + TypeScript + Hono** | Ultra-lightweight; identical `fetch` handler runs locally, in Docker, on **Cloudflare Workers**, and on **Oracle Cloud**. | **Cloudflare Workers** (100k req/day, Cron Triggers) or **Oracle Always Free** (Ampere A1 2 OCPU / 12 GB RAM). |
| **Database** | **SQLite** (`better-sqlite3` / `node:sqlite`) + **Drizzle ORM** | Zero-setup local DB for judges; maps 1:1 to **Cloudflare D1** (5 GB free). | **Cloudflare D1** or local/Oracle SQLite. |
| **Auth & Vault** | **Better Auth (MIT)** + AES-256-GCM | 100% MIT, self-hosted in our own DB, no user caps. | Included in app + D1/SQLite. |
| **Frontend / Mobile** | **Installable PWA** (HTML/CSS/TS + Service Worker + Web Push) | Cross-platform mobile + desktop app with native push notifications and zero App Store friction. | **Cloudflare Pages / Workers** (unlimited static assets). |
| **LLM Layer** | **OpenAI-compatible adapter** (Groq/Gemini free → Workers AI → Ollama) | Fast free cloud demos + 100% offline **Ollama** (`qwen3:4b`) fallback for judges. | **Workers AI** (10k Neurons/day) / **Groq** / **Gemini** free tiers. |

---

## 6. MoSCoW Execution Plan (68 Hours Remaining to Nov 30, 18:00 UTC)

### MUST HAVE (P0 — Core Win, Target: Nov 28, 24:00 UTC)
* [ ] Public MIT repo (`Manofval0r/annie`), `README.md`, `AGENT.md`, `SAFETY.md`, `.agentware.toml`, `.env.example`
* [ ] Hono + TypeScript + SQLite core orchestrator (`parse → gather → sanitise → plan → act → reply`)
* [ ] **Safety +4:** `policy.ts` code guardrails, `/monitor` SSE live view, `POST /kill/:runId` (`AbortController`), SHA-256 hash-chain audit + `npm run replay`
* [ ] **Hero Use Case:** *"Remind me to go to school Tuesday 6pm"* → `.ics` + SQLite reminder + **T-30m proactive heartbeat** (`Open-Meteo` + `OSRM` ETA + `ntfy.sh`/Web Push with *Get Directions* button)
* [ ] **Channels:** Web PWA + Telegram Bot + Mock CLI sharing unified `user_id` & `LINK-XXXXXX` linking
* [ ] **Trap Pack:** Official Trap Pack + 10 custom adversarial fixtures in `tests/trap-pack/RESULTS.md`

### SHOULD HAVE (P1 — High-Impact Differentiators, Target: Nov 29, 18:00 UTC)
* [ ] **Unified OAuth Vault (Better Auth + Encrypted SQLite):** Connect Google (Gmail, Calendar, Search Console) & Microsoft (Outlook) once on Web → use from Telegram/WhatsApp/PWA, plus **1-click Judge Sandbox Mode**
* [ ] **WhatsApp Cloud API** adapter (official Meta API + webhook signature verification)
* [ ] **Treg Pro Mode:** Search Console traffic, AdSense/Analytics summary, TikTok video metrics via `TREG_TOKEN`
* [ ] **Bill/Renewal Triage:** Parse incoming bill/email, quarantine injections, require `YES <id>` for any irreversible action

### WILL HAVE (P2 — Polish & Extra Channels, Target: Nov 30, 06:00 UTC)
* [ ] **Responsive HTML Mockups** (`docs/mockups/`) verified at `375px` (mobile), `768px` (tablet), and `1280px` (desktop) before UI finalization
* [ ] **Proactive Voice Call Escalation:** `Telnyx` (`$25` free credit) / `Vapi` adapter + Browser Web Speech API fallback
* [ ] **One-command Cloudflare Workers + D1 deploy** (`wrangler deploy`)

### CAN HAVE (P3 — Only if P0–P2 are 100% Green)
* [ ] `BlueBubbles` (Apache-2.0) iMessage bridge adapter
* [ ] `Keenable` web search accelerator / `PigeonRelay` trusted-person handoff

---

## 7. Engineering Workflow Rules (Enforced from Commit #1)
1. **High-Frequency Commits:** Commit every logical unit (60–100+ commits welcome); proves all code was written inside the 72-hour window.
2. **Branch + PR Workflow:** Every feature, fix, or exploration uses a dedicated branch (`feat/...`, `fix/...`, `chore/...`) and a GitHub Pull Request into `main`.
3. **Pre-Merge Code Review (`superpowers:requesting-code-review`):** Every PR is reviewed against requirements, safety boundaries, and tests before merging to `main`.
4. **Responsive HTML Mockups First:** Validate mobile (`375px`) vs web (`1280px`) element widths and overflow in HTML mockups before shipping UI changes.

---

## 8. Sources & Bibliography
1. [Agentware 2026 Brief](https://agentwarehack.com/brief/) & [Trap Pack](https://agentwarehack.com/trap-pack/)
2. [bilawalsidhu/gods-eye-view (GitHub)](https://github.com/bilawalsidhu/gods-eye-view) — MIT code / CC BY-NC-SA datasets
3. [Treg — Unified Agent API Gateway (`treg.to/llms.txt`)](https://treg.to/llms.txt)
4. [Better Auth (MIT)](https://better-auth.com)
5. [Keenable (`keenable.ai`)](https://keenable.ai) & [PigeonRelay (`pigeonrelay.ai`)](https://pigeonrelay.ai)
6. [OSRM](https://github.com/Project-OSRM/osrm-backend/blob/master/docs/http.md), [OpenRouteService](https://openrouteservice.org/dev/), [Open-Meteo](https://open-meteo.com), [ntfy.sh](https://ntfy.sh)
7. [OpenClaw (MIT)](https://todofor.ai), [Hermes Agent (MIT)](https://medium.com), [Vellum (MIT)](https://vellum.ai), [BlueBubbles (Apache-2.0)](https://bluebubbles.app)
8. [Telnyx Voice API](https://telnyx.com), [Vapi](https://vapi.ai), [WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/groups/pricing)
