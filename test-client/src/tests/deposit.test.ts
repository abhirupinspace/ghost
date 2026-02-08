import { describe, test, expect } from "bun:test";
import { ethers } from "ethers";
import {
  lender1,
  borrower1,
  getContract,
  getReadContract,
  apiGet,
  waitForIndexer,
} from "../helpers.ts";

describe("deposits", () => {
  const amount = ethers.parseEther("0.01");

  test("lender deposits → getLenderBalance increases", async () => {
    const contract = getContract(lender1);
    const read = getReadContract();
    const before = await read.getLenderBalance(lender1.address);
    const tx = await contract.depositLend({ value: amount });
    await tx.wait();
    const after = await read.getLenderBalance(lender1.address);
    expect(after - before).toBe(amount);
  }, 30_000);

  test("borrower deposits collateral → getBorrowerCollateral increases", async () => {
    const contract = getContract(borrower1);
    const read = getReadContract();
    const before = await read.getBorrowerCollateral(borrower1.address);
    const tx = await contract.depositCollateral({ value: amount });
    await tx.wait();
    const after = await read.getBorrowerCollateral(borrower1.address);
    expect(after - before).toBe(amount);
  }, 30_000);

  test("activity shows up after deposit", async () => {
    await waitForIndexer(5000);
    const res = await apiGet(`/user/${lender1.address}/activity`);
    expect(res.ok).toBe(true);
    expect(Array.isArray(res.data)).toBe(true);
  }, 15_000);

  test("deposit 0 reverts", async () => {
    const contract = getContract(lender1);
    try {
      const tx = await contract.depositLend({ value: 0 });
      await tx.wait();
      throw new Error("should have reverted");
    } catch (e: any) {
      expect(e.message).toContain("zero amount");
    }
  }, 15_000);
});
