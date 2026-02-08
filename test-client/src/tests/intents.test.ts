import { describe, test, expect } from "bun:test";
import { ethers } from "ethers";
import { lender1, borrower1, apiPost, apiGet, apiDelete } from "../helpers.ts";

describe("intents", () => {
  let lendIntentId: number;
  let borrowIntentId: number;

  test("POST /intent/lend → creates intent", async () => {
    const res = await apiPost("/intent/lend", {
      address: lender1.address,
      amount: ethers.parseEther("0.005").toString(),
      minRate: "500",
      duration: 86400,
      tranche: "senior",
    });
    expect(res.ok).toBe(true);
    expect(res.data.id).toBeDefined();
    expect(res.data.type).toBe("lend");
    lendIntentId = res.data.id;
  });

  test("POST /intent/borrow → creates intent", async () => {
    const res = await apiPost("/intent/borrow", {
      address: borrower1.address,
      amount: ethers.parseEther("0.005").toString(),
      maxRate: "1000",
      duration: 86400,
    });
    expect(res.ok).toBe(true);
    expect(res.data.id).toBeDefined();
    expect(res.data.type).toBe("borrow");
    borrowIntentId = res.data.id;
  });

  test("GET /intents/:address → lists active intents", async () => {
    const res = await apiGet(`/intents/${lender1.address}`);
    expect(res.ok).toBe(true);
    expect(Array.isArray(res.data)).toBe(true);
  });

  test("DELETE /intent/:id → deactivates intent", async () => {
    const res = await apiDelete(`/intent/${lendIntentId}`);
    expect(res.ok).toBe(true);
    expect(res.data.active).toBe(false);
  });

  test("GET /market/orderbook → shows intents", async () => {
    const res = await apiGet("/market/orderbook");
    expect(res.ok).toBe(true);
    expect(res.data.lends).toBeDefined();
    expect(res.data.borrows).toBeDefined();
  });

  // -- Sad paths --

  test("POST /intent/lend missing amount → 400", async () => {
    const res = await apiPost("/intent/lend", {
      address: lender1.address,
      duration: 86400,
    });
    expect(res.ok).toBe(false);
  });

  test("POST /intent/lend missing address → 400", async () => {
    const res = await apiPost("/intent/lend", {
      amount: "1000",
      duration: 86400,
    });
    expect(res.ok).toBe(false);
  });

  test("POST /intent/borrow missing duration → 400", async () => {
    const res = await apiPost("/intent/borrow", {
      address: borrower1.address,
      amount: "1000",
    });
    expect(res.ok).toBe(false);
  });

  test("DELETE /intent/99999 → error", async () => {
    const res = await apiDelete("/intent/99999");
    expect(res.ok).toBe(false);
  });

  // cleanup borrow intent
  test("cleanup: delete borrow intent", async () => {
    if (borrowIntentId) {
      await apiDelete(`/intent/${borrowIntentId}`);
    }
  });
});
