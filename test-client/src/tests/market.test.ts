import { describe, test, expect } from "bun:test";
import { apiGet } from "../helpers.ts";

describe("market endpoints", () => {
  test("GET /market/stats → returns counts/totals", async () => {
    const res = await apiGet("/market/stats");
    expect(res.ok).toBe(true);
    expect(res.data.lendSupply).toBeDefined();
    expect(res.data.lendSupply.count).toBeGreaterThanOrEqual(0);
    expect(res.data.borrowDemand).toBeDefined();
    expect(res.data.activeLoans).toBeDefined();
  });

  test("GET /market/orderbook → returns lends/borrows", async () => {
    const res = await apiGet("/market/orderbook");
    expect(res.ok).toBe(true);
    expect(Array.isArray(res.data.lends)).toBe(true);
    expect(Array.isArray(res.data.borrows)).toBe(true);
  });
});
