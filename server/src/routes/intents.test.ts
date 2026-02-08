import { describe, it, expect, beforeAll, afterAll } from "bun:test";

// Basic unit tests for intent validation logic
describe("Intent Routes", () => {
  it("should reject missing fields for lend", async () => {
    const app = (await import("../index")).default;
    const res = await app.request("/intent/lend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  it("should reject missing fields for borrow", async () => {
    const app = (await import("../index")).default;
    const res = await app.request("/intent/borrow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const json = await res.json();
    expect(json.ok).toBe(false);
  });
});
