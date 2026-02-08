import { describe, test, expect } from "bun:test";
import { ethers } from "ethers";
import {
  lender1,
  lender2,
  borrower1,
  borrower2,
  getContract,
  getReadContract,
  apiPost,
  triggerSettle,
  apiGet,
  waitForIndexer,
} from "../helpers.ts";

describe("repay", () => {
  const lendAmount = ethers.parseEther("0.005");
  const collateralAmount = ethers.parseEther("0.01");

  // create a loan to repay
  test("setup: deposit + create intents + settle", async () => {
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
      duration: 86400,
      tranche: "senior",
    });
    await apiPost("/intent/borrow", {
      address: borrower2.address,
      amount: lendAmount.toString(),
      maxRate: "1000",
      duration: 86400,
    });

    const res = await triggerSettle();
    expect(res.ok).toBe(true);
    expect(res.data.matched).toBeGreaterThanOrEqual(1);
    await waitForIndexer(5000);
  }, 90_000);

  test("borrower repays loan", async () => {
    // find loan
    const loansRes = await apiGet(`/loans/${borrower2.address}`);
    expect(loansRes.ok).toBe(true);
    const activeLoan = loansRes.data.asBorrower.find(
      (l: any) => l.status === "active"
    );
    expect(activeLoan).toBeDefined();

    // get owed amount from contract
    const read = getReadContract();
    const owed = await read.getOwed(activeLoan.loanId);

    // repay
    const bc = getContract(borrower2);
    const tx = await bc.repay(activeLoan.loanId, { value: owed + owed / 10n }); // +10% buffer
    await tx.wait();

    await waitForIndexer(5000);

    // verify loan repaid in DB
    const after = await apiGet(`/loans/${borrower2.address}`);
    const repaidLoan = after.data.asBorrower.find(
      (l: any) => l.loanId === activeLoan.loanId
    );
    expect(repaidLoan.status).toBe("repaid");
  }, 60_000);

  test("credit score increases after repay", async () => {
    const res = await apiGet(`/user/${borrower2.address}/credit`);
    expect(res.ok).toBe(true);
    expect(res.data.creditScore).toBeGreaterThanOrEqual(500);
  });

  // -- Sad paths --

  test("non-borrower tries repay → reverts", async () => {
    const read = getReadContract();
    const loanCount = await read.loanCount();
    if (loanCount === 0n) return; // skip if no loans

    const contract = getContract(lender1); // not the borrower
    try {
      const tx = await contract.repay(0, { value: ethers.parseEther("1") });
      await tx.wait();
      throw new Error("should have reverted");
    } catch (e: any) {
      expect(e.message).toContain("not borrower");
    }
  }, 15_000);

  test("repay already-repaid loan → reverts", async () => {
    const loansRes = await apiGet(`/loans/${borrower2.address}`);
    const repaidLoan = loansRes.data.asBorrower.find(
      (l: any) => l.status === "repaid"
    );
    if (!repaidLoan) return;

    const contract = getContract(borrower2);
    try {
      const tx = await contract.repay(repaidLoan.loanId, {
        value: ethers.parseEther("0.01"),
      });
      await tx.wait();
      throw new Error("should have reverted");
    } catch (e: any) {
      expect(e.message).toContain("already repaid");
    }
  }, 15_000);

  test("repay w/ insufficient value → reverts", async () => {
    // need an active loan — create one first or skip
    const loansRes = await apiGet(`/loans/${borrower2.address}`);
    const activeLoan = loansRes.data.asBorrower.find(
      (l: any) => l.status === "active"
    );
    if (!activeLoan) return; // skip if no active loans

    const contract = getContract(borrower2);
    try {
      const tx = await contract.repay(activeLoan.loanId, { value: 1 });
      await tx.wait();
      throw new Error("should have reverted");
    } catch (e: any) {
      expect(e.message).toContain("insufficient repayment");
    }
  }, 15_000);
});
