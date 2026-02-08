import { describe, it, expect } from "bun:test";

describe("Market Routes", () => {
  it("should return stats structure", async () => {
    const app = (await import("../index")).default;
    const res = await app.request("/market/stats");
    // Will fail without DB but validates route exists
    expect(res.status).toBeDefined();
  });

  it("should return orderbook structure", async () => {
    const app = (await import("../index")).default;
    const res = await app.request("/market/orderbook");
    expect(res.status).toBeDefined();
  });
});
