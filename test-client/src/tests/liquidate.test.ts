import { describe, test, expect } from "bun:test";
import { ethers } from "ethers";
import {
  lender2,
  borrower2,
  getContract,
  getReadContract,
  apiPost,
  apiGet,
  triggerSettle,
  triggerLiquidate,
  waitForIndexer,
  sleep,
  api,
} from "../helpers.ts";

describe("liquidate", () => {
  const lendAmount = ethers.parseEther("0.003");
  const collateralAmount = ethers.parseEther("0.006");

  test("setup: create loan w/ 1s duration", async () => {
    const lc = getContract(lender2);
    const bc = getContract(borrower2);

    const tx1 = await lc.depositLend({ value: lendAmount });
    await tx1.wait();
    const tx2 = await bc.depositCollateral({ value: collateralAmount });
    await tx2.wait();

    await apiPost("/intent/lend", {
      address: lender2.address,
      amount: lendAmount.toString(),
      minRate: "500",
      duration: 1, // 1 second — will be overdue almost immediately
      tranche: "senior",
    });
    await apiPost("/intent/borrow", {
      address: borrower2.address,
      amount: lendAmount.toString(),
      maxRate: "1000",
      duration: 1,
    });

    const res = await triggerSettle();
    expect(res.ok).toBe(true);
    expect(res.data.matched).toBeGreaterThanOrEqual(1);
    await waitForIndexer(5000);
  }, 90_000);

  test("wait for loan to become overdue then liquidate", async () => {
    // wait for duration to pass
    await sleep(3000);

    const res = await triggerLiquidate();
    expect(res.ok).toBe(true);
    expect(res.data.liquidated).toBeGreaterThanOrEqual(1);

    await waitForIndexer(5000);

    // verify loan defaulted in DB
    const loansRes = await apiGet(`/loans/${borrower2.address}`);
    const defaultedLoan = loansRes.data.asBorrower.find(
      (l: any) => l.status === "defaulted"
    );
    expect(defaultedLoan).toBeDefined();
  }, 60_000);

  test("credit score decreased after default", async () => {
    const res = await apiGet(`/user/${borrower2.address}/credit`);
    expect(res.ok).toBe(true);
    // score was 500 (or higher from repay test), -150 on default
    expect(res.data.creditScore).toBeLessThanOrEqual(500);
  });

  // -- Sad paths --

  test("POST /trigger/liquidate w/o API key → 401", async () => {
    const res = await api("/trigger/liquidate", { method: "POST" });
    expect(res.error).toBe("unauthorized");
  });

  test("liquidate w/ no overdue loans → liquidated=0", async () => {
    const res = await triggerLiquidate();
    expect(res.ok).toBe(true);
    expect(res.data.liquidated).toBe(0);
  }, 30_000);
});
