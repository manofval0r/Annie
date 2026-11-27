import { describe, it, expect } from "vitest";
import { createDb } from "../../src/db/client.js";

describe("SQLite Schema & Client (node:sqlite)", () => {
  it("initializes all tables in memory and inserts a user", () => {
    const db = createDb(":memory:");
    db.prepare(
      "INSERT INTO users (id, email, name, is_sandbox, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run("usr-sandbox", "sandbox@annie.local", "Judge Sandbox", 1, new Date().toISOString());

    const rows = db.prepare("SELECT id, email, is_sandbox FROM users").all() as Array<{
      id: string;
      email: string;
      is_sandbox: number;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("sandbox@annie.local");
    expect(rows[0].is_sandbox).toBe(1);
    db.close();
  });
});
