# Annie — Product Requirements Document (PRD v2.0)

**Project:** Annie (formerly "Relay" v1.0) — A Text-First, Proactive Personal Life Admin Agent  
**Event:** Hackathon Raptors, Agentware 2026 (Kickoff: Nov 27, 2026 18:00 UTC | Code Freeze: Nov 30, 2026 18:00 UTC)  
**Repository:** [https://github.com/manofval0r/Annie](https://github.com/manofval0r/Annie) (Public, MIT License)  
**Primary Track:** **Life Admin** (Fallback: **Open Track**)  
**Document Version:** 2.0 (Overhauled Nov 27, 2026)

---

## 1. Executive Summary

Instinct proved that **"no new interface"**—texting or calling a personal agent that actually executes errands—is a $10B product category. However, Instinct's biggest flaw is over-permissioned account access and opaque data handling.

**Annie** is an open-source (MIT), text-first, proactive Life Admin agent engineered for **trust, autonomy, and cross-platform continuity**:
> *Text Annie once on Web PWA, WhatsApp, or Telegram. Annie schedules your event, creates your `.ics`/CalDAV entry, wakes up 30 minutes before departure to check live weather and OSRM travel time, pushes an interactive notification offering one-tap directions, triages bills/renewals, and—if you connect your Google/Microsoft/Treg accounts—monitors your Search Console, Analytics, and TikTok metrics across every channel, all behind code-enforced guardrails, a live monitor, a mid-flight kill switch, and a replayable SHA-256 audit log.*

### Why Annie Wins Agentware 2026
* **Autonomy (30%):** Both reactive 1-shot execution AND a **proactive T-30m heartbeat loop** ("build something you can walk away from").
* **Usefulness (25%):** 4 high-frequency Life Admin + Pro workflows sharing one clean core.
* **Reliability (20%):** Automated Trap Pack runner (`tests/trap-pack/RESULTS.md`), schema-enforced LLM outputs, SSRF allow-lists, and cached fallbacks.
* **Engineering (15%):** Runs locally in <15 minutes with **zero paid keys** via **1-click Judge Sandbox Mode** + Ollama fallback.
* **Demo (10%) + Safety Bonus (+4):** Split-screen ≤3 min video showing unattended run, proactive T-30m push, Trap Pack block, Kill Switch (`POST /kill/:runId`), and `npm run replay`.

---

## 2. Scope & MoSCoW Prioritization

### MUST HAVE (P0 — Core Win)
1. **Core Orchestrator & Safety (+4):** Hono + TypeScript + SQLite state machine (`parse → gather → sanitise → plan → act → reply`), `policy.ts` code chokepoint, `/monitor` SSE, `POST /kill/:runId` (`AbortController`), SHA-256 hash-chain audit + `npm run replay`.
2. **Hero Use Case — Smart Calendar + Proactive T-30m Directions:** *"Remind me to go to school Tuesday 6pm"* → `.ics` + SQLite reminder → T-30m heartbeat checks `Open-Meteo` weather + `OSRM` ETA → pushes interactive `ntfy.sh` / Web Push alert (*"Leave in 16 mins? Tap for directions"*).
3. **Weather-Aware Errand / Weekend Planner:** Geocoding + Open-Meteo + Nager.Date + Frankfurter + Overpass + OSRM travel times → 1 primary plan + 1 rain swap + `.ics`.
4. **Cross-Channel Continuity:** Web PWA + Telegram Bot + Mock CLI sharing unified `user_id` via `LINK-XXXXXX` one-time code.
5. **Trap Pack Harness:** Automated runner against official Agentware Trap Pack + 10 custom fixtures, committed in `tests/trap-pack/RESULTS.md`.

### SHOULD HAVE (P1 — Differentiators)
6. **Unified Cross-Channel Auth & Token Vault:** **Better Auth (MIT)** + AES-256-GCM encrypted `oauth_connections` table. Authenticate Gmail, Google Calendar, Search Console, or Outlook **once** on Web PWA → fetch/act from Telegram, WhatsApp, or Mobile PWA. Includes **1-click Judge Sandbox Mode**.
7. **WhatsApp Cloud API Adapter:** Official Meta Cloud API webhook with signature verification and allow-list.
8. **Treg Pro / Creator Mode (`treg.to`):** Optional `X-Treg-Token` integration for Search Console traffic (unmetered BYOK), AdSense/Analytics summaries, and TikTok video/profile metrics (`$20` free credits).
9. **Bill / Renewal Triage:** Parses incoming notices, quarantines prompt injections, blocks any payment/external send in `policy.ts` without single-use `YES <id>`.

### WILL HAVE (P2 — Polish & Escalation)
10. **Responsive HTML Mockups:** Verified at `375px` (mobile), `768px` (tablet), and `1280px` (desktop) in `docs/mockups/` before UI finalization.
11. **Proactive Voice Escalation:** Optional **Telnyx** (`$25` free credit) / **Vapi** outbound reminder call for unacknowledged urgent alerts, with zero-key **Browser Web Speech API** fallback.
12. **One-Command Cloud Deploy:** `wrangler deploy` to **Cloudflare Workers + D1 + Cron Triggers** (free tier), plus **Oracle Cloud Always Free** Docker/Node docs.

### CAN HAVE (P3 — Post-Hackathon / Stretch)
13. `BlueBubbles` (Apache-2.0) iMessage bridge adapter.
14. `Keenable` web search accelerator / `PigeonRelay` trusted-person agent-to-agent handoff.

---

## 3. Architecture & Tech Stack

* **Runtime:** Node 22 + TypeScript + **Hono** (Workers-compatible `fetch` handler).
* **Database:** **SQLite** (`node:sqlite` / `better-sqlite3`) + **Drizzle ORM** → 1:1 portable to **Cloudflare D1**.
* **Auth & Secrets Gate:** **Better Auth (MIT)** + AES-256-GCM Token Vault. Raw OAuth tokens **never** enter LLM context; `policy.ts` validates scope and tool executors inject headers server-side.
* **Frontend / Mobile:** **Installable Web PWA** (Service Worker + Web Push VAPID + `ntfy.sh`) + `/monitor` live SSE dashboard.
* **LLM Layer:** OpenAI-compatible interface: Groq/Gemini free tier → Cloudflare Workers AI → **Ollama** (`qwen3:4b`, zero-key local default).
* **Zero-Key External APIs:** `OSRM`, `OpenRouteService` (optional), `Nominatim`, `Overpass`, `Open-Meteo`, `Nager.Date`, `Frankfurter`, `OpenFoodFacts`, `ntfy.sh`.

---

## 4. Non-Goals & Rules Compliance
* No real money spent without hard cap (`ALLOW_PAYMENTS=false` in demo) and explicit `YES <id>` approval.
* No unofficial WhatsApp scrapers (Baileys/Evolution banned); official Cloud API only.
* No `gods-eye-view` CC BY-NC-SA datasets or `Nell` FSL-licensed code; 100% original MIT code written inside the 72-hour window.
* Never ask judges for personal credentials; Judge Sandbox Mode + Mock CLI work out of the box.
