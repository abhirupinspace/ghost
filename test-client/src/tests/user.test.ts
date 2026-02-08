import { describe, test, expect } from "bun:test";
import { lender1, borrower1, apiGet } from "../helpers.ts";

describe("user endpoints", () => {
  test("GET /user/:addr/credit → returns default 500", async () => {
    // use a fresh address that has never interacted
    const res = await apiGet(
      `/user/0x0000000000000000000000000000000000000001/credit`
    );
    expect(res.ok).toBe(true);
    expect(res.data.creditScore).toBe(500);
  });

  test("GET /user/:addr/lends → returns data", async () => {
    const res = await apiGet(`/user/${lender1.address}/lends`);
    expect(res.ok).toBe(true);
    expect(res.data.onChainBalance).toBeDefined();
    expect(res.data.activeIntents).toBeDefined();
    expect(res.data.positions).toBeDefined();
  });

  test("GET /user/:addr/borrows → returns data", async () => {
    const res = await apiGet(`/user/${borrower1.address}/borrows`);
    expect(res.ok).toBe(true);
    expect(res.data.onChainCollateral).toBeDefined();
    expect(res.data.activeIntents).toBeDefined();
    expect(res.data.loans).toBeDefined();
  });

  test("GET /user/:addr/activity → returns array", async () => {
    const res = await apiGet(`/user/${lender1.address}/activity`);
    expect(res.ok).toBe(true);
    expect(Array.isArray(res.data)).toBe(true);
  });

  test("GET /user/invalid-address/credit → still works", async () => {
    const res = await apiGet(`/user/invalid-address/credit`);
    expect(res.ok).toBe(true);
    expect(res.data.creditScore).toBe(500);
  });
});
