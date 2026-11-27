import { describe, it, expect } from "vitest";
import { createDb } from "../../src/db/client.js";
import {
  enableJudgeSandbox,
  generateLinkCode,
  getOAuthToken,
  listOAuthConnections,
  redeemLinkCode,
  resolveChannelUserId,
  saveOAuthConnection,
} from "../../src/auth/vault.js";

describe("Unified Cross-Channel Auth & Encrypted Token Vault", () => {
  it("links Telegram to Web account via 6-digit code and shares encrypted OAuth tokens", () => {
    const db = createDb(":memory:");
    const { userId, linkCode } = enableJudgeSandbox(db, "web-1");

    // Before linking, Telegram user is isolated
    expect(resolveChannelUserId(db, "telegram", "tg-999")).toBe("telegram:tg-999");
    expect(getOAuthToken(db, "telegram:tg-999", "google_gmail")).toBeNull();

    // Redeem link code on Telegram
    const redeemed = redeemLinkCode(db, "telegram", "tg-999", linkCode);
    expect(redeemed.linked).toBe(true);
    expect(redeemed.userId).toBe(userId);

    // Same code cannot be reused
    expect(redeemLinkCode(db, "whatsapp", "wa-111", linkCode).linked).toBe(false);

    // Now Telegram resolves to the exact same userId and encrypted Gmail token
    const tgUserId = resolveChannelUserId(db, "telegram", "tg-999");
    expect(tgUserId).toBe(userId);
    expect(getOAuthToken(db, tgUserId, "google_gmail")).toBe("sandbox_mock_gmail_token");

    // UI metadata never exposes tokens
    const list = listOAuthConnections(db, userId);
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(list)).not.toContain("sandbox_mock_gmail_token");
    db.close();
  });

  it("rejects expired link codes and encrypts custom OAuth tokens at rest", () => {
    const db = createDb(":memory:");
    const past = new Date(Date.now() - 20 * 60_000);
    const expiredCode = generateLinkCode(db, "usr-1", past);
    expect(redeemLinkCode(db, "whatsapp", "wa-1", expiredCode).linked).toBe(false);

    saveOAuthConnection(db, {
      userId: "usr-1",
      provider: "microsoft_outlook",
      accessToken: "ms_secret_token_xyz",
      scopes: "Mail.Read Calendars.ReadWrite",
    });

    const rawRow = db
      .prepare("SELECT encrypted_access_token FROM oauth_connections WHERE user_id = 'usr-1'")
      .get() as { encrypted_access_token: string };
    expect(rawRow.encrypted_access_token).not.toContain("ms_secret_token_xyz");
    expect(getOAuthToken(db, "usr-1", "microsoft_outlook")).toBe("ms_secret_token_xyz");
    db.close();
  });
});
