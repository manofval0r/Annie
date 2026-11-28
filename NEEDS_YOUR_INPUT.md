# Items Requiring Your Input / Credentials (Optional Accelerators)

Annie runs **100% locally with zero keys** using `LLM_PROVIDER=mock`, built-in `node:sqlite`, keyless APIs (`OSRM`, `Open-Meteo`, `Wikipedia`, `OpenFoodFacts`, `Frankfurter`, `ntfy.sh`), and **1-Click Sandbox**.

Whenever you are ready to connect live external accounts or deploy to Cloudflare, here is the exact checklist:

1. **Cloudflare Workers Free-Forever Deploy:**
   * `wrangler.toml` and `src/worker.ts` are ready.
   * Run: `npx wrangler login && npx wrangler deploy`
   * Optional D1 persistence: `npx wrangler d1 create annie-db` and paste the `database_id` into `wrangler.toml`.
2. **Google OAuth (Live Gmail, Google Calendar, Search Console):**
   * Create an OAuth 2.0 Web Client in Google Cloud Console with redirect `http://localhost:3000/auth/google/callback`.
   * Add `GOOGLE_CLIENT_ID=` and `GOOGLE_CLIENT_SECRET=` to `.env`.
3. **GitHub Integration:**
   * Public repos work with zero keys (e.g., `"check github manofval0r/Annie"`).
   * For private repos/notifications, add `GITHUB_TOKEN=` in `.env`.
4. **Telegram Bot (Local Long-Polling — Zero Webhook Needed):**
   * Get a token from `@BotFather` (2 min), set `TELEGRAM_BOT_TOKEN=` and `TELEGRAM_POLLING=true` in `.env`.
5. **Treg `$20` Free Credits (Search Console / TikTok / AdSense):**
   * Once approved from your opt-in, set `TREG_TOKEN=` in `.env`.
6. **Telnyx `$25` Free Voice Calls:**
   * Set `TELNYX_API_KEY=` and `TELNYX_FROM_NUMBER=+1...` in `.env` (falls back to Browser Web Speech if unset).
7. **Demo Video & Submission (Before Nov 30, 18:00 UTC):**
   * Record ≤3 min unlisted video following `demo/script.md` and submit on the Agentware form.
