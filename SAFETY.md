# SAFETY.md — Guardrails, Kill Switch & Threat Model

## Threat Model ("The Lethal Trifecta")
Personal agents combine private data, untrusted external content, and action capability. Annie breaks this trifecta in **code**, not prompts:

1. **Secrets Gate (No Tokens in LLM Context):** OAuth tokens are encrypted at rest with AES-256-GCM (`src/core/crypto.ts`). The LLM only sees `userId` and scoped capability names; tool executors inject `Authorization` headers server-side after `policy.ts` approves.
2. **Code-Enforced Policy Chokepoint (`src/core/policy.ts`):**
   * **Intent Allow-List:** Only typed, schema-validated intents are accepted.
   * **SSRF Guard:** Outbound HTTP requests are restricted to a static domain allow-list; private IPv4/IPv6/link-local ranges (`127.0.0.1`, `169.254.169.254`, `10.x`, `192.168.x`) are blocked in code.
   * **Spend Cap:** `ALLOW_PAYMENTS=false` and `MAX_ESTIMATED_COST_USD=0.01` are enforced in code.
   * **Single-Use Approvals:** Irreversible actions require `YES <approvalId>` bound to exact action + amount.
3. **Untrusted-by-Default Sanitiser (`src/core/sanitise.ts`):** Strips hidden HTML (`display:none`), caps external payloads at 8 KB, redacts card/API-key patterns, and quarantines instruction-like strings (`injection_suspected`) before planning.
4. **Live Monitor (`/monitor` SSE):** Streams every step, tool call, policy decision, latency, and estimated cost in real time.
5. **Kill Switch (`POST /kill/:runId`):** Sets a persistent/in-memory kill flag checked before every step and cancels in-flight `fetch` calls immediately via `AbortController`, writing `killed_by_user`.
6. **Hash-Chain Audit Trail (`src/core/audit.ts`):** Every event links `prevHash → hash` (SHA-256). `npm run replay -- <runId>` verifies integrity on read.

## Residual Risks
A sufficiently subtle prompt injection inside a third-party POI description could still influence non-privileged *ranking* without violating tool schemas. We test for this in `tests/trap-pack/` and document all findings in `tests/trap-pack/RESULTS.md`.
