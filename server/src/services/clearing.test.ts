import { describe, it, expect } from "bun:test";
import type { LoanMatch } from "./clearing";

describe("Clearing Algorithm", () => {
  it("LoanMatch type should have required fields", () => {
    const match: LoanMatch = {
      borrower: "0x1234",
      seniorLenders: ["0xaaaa"],
      seniorAmounts: [1000n],
      juniorLenders: [],
      juniorAmounts: [],
      principal: 1000n,
      collateralAmount: 1500n,
      rate: 500,
      duration: 86400 * 30,
    };
    expect(match.borrower).toBe("0x1234");
    expect(match.seniorLenders.length).toBe(1);
    expect(match.principal).toBe(1000n);
  });
});
