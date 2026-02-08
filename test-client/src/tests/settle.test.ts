import { describe, test, expect } from "bun:test";
import { ethers } from "ethers";
import {
  lender1,
  borrower1,
  getContract,
  getReadContract,
  apiPost,
  apiGet,
  apiDelete,
  triggerSettle,
  waitForIndexer,
  api,
} from "../helpers.ts";

describe("settle", () => {
  const lendAmount = ethers.parseEther("0.005");
  const collateralAmount = ethers.parseEther("0.01"); // 200% for default 500 score

  test("setup: deposit lend + collateral", async () => {
    const lc = getContract(lender1);
    const bc = getContract(borrower1);

    const tx1 = await lc.depositLend({ value: lendAmount });
    await tx1.wait();
    const tx2 = await bc.depositCollateral({ value: collateralAmount });
    await tx2.wait();

    const read = getReadContract();
    const lb = await read.getLenderBalance(lender1.address);
    const bc2 = await read.getBorrowerCollateral(borrower1.address);
    expect(lb).toBeGreaterThanOrEqual(lendAmount);
    expect(bc2).toBeGreaterThanOrEqual(collateralAmount);
  }, 30_000);

  let lendIntentId: number;
  let borrowIntentId: number;

  test("create matching intents", async () => {
    const lendRes = await apiPost("/intent/lend", {
      address: lender1.address,
      amount: lendAmount.toString(),
      minRate: "500",
      duration: 86400,
      tranche: "senior",
    });
    expect(lendRes.ok).toBe(true);
    lendIntentId = lendRes.data.id;

    const borrowRes = await apiPost("/intent/borrow", {
      address: borrower1.address,
      amount: lendAmount.toString(),
      maxRate: "1000",
      duration: 86400,
    });
    expect(borrowRes.ok).toBe(true);
    borrowIntentId = borrowRes.data.id;
  });

  test("POST /trigger/settle → matched >= 1", async () => {
    const res = await triggerSettle();
    expect(res.ok).toBe(true);
    expect(res.data.matched).toBeGreaterThanOrEqual(1);
  }, 60_000);

  test("loan appears in DB", async () => {
    await waitForIndexer(5000);
    const res = await apiGet(`/loans/${borrower1.address}`);
    expect(res.ok).toBe(true);
    expect(res.data.asBorrower.length).toBeGreaterThanOrEqual(1);
  }, 15_000);

  test("lender position appears", async () => {
    const res = await apiGet(`/user/${lender1.address}/lends`);
    expect(res.ok).toBe(true);
  });

  // -- Sad paths --

  test("POST /trigger/settle w/o API key → 401", async () => {
    const res = await api("/trigger/settle", { method: "POST" });
    expect(res.error).toBe("unauthorized");
  });

  test("POST /trigger/settle w/ wrong API key → 401", async () => {
    const res = await api("/trigger/settle", {
      method: "POST",
      headers: { "x-api-key": "wrong-key" },
    });
    expect(res.error).toBe("unauthorized");
  });

  test("settle w/ no matching intents → matched=0", async () => {
    const res = await triggerSettle();
    expect(res.ok).toBe(true);
    expect(res.data.matched).toBe(0);
  }, 30_000);
});
