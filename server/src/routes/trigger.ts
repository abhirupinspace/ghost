import { Hono } from "hono";
import { apiKeyAuth } from "../lib/auth";
import { ok, err } from "../lib/responses";
import { clearMarket } from "../services/clearing";
import { db } from "../db";
import { loans } from "../db/schema";
import { eq } from "drizzle-orm";
import { getSignedContract } from "../lib/contract";

export const triggerRoutes = new Hono();

// POST /trigger/settle — match intents and execute loans
triggerRoutes.post("/trigger/settle", apiKeyAuth, async (c) => {
  try {
    const matches = await clearMarket();
    if (matches.length === 0) return ok(c, { matched: 0 });

    const contract = getSignedContract();
    const results = [];

    for (const match of matches) {
      try {
        const tx = await contract.executeLoan(
          match.borrower,
          match.seniorLenders,
          match.seniorAmounts,
          match.juniorLenders,
          match.juniorAmounts,
          match.principal,
          match.collateralAmount,
          match.rate,
          match.duration
        );
        const receipt = await tx.wait();
        results.push({ borrower: match.borrower, principal: match.principal.toString(), txHash: receipt.hash });
      } catch (e: any) {
        results.push({ borrower: match.borrower, error: e.message });
      }
    }

    return ok(c, { matched: matches.length, results });
  } catch (e: any) {
    return err(c, e.message, 500);
  }
});

// POST /trigger/liquidate — find and liquidate overdue loans
triggerRoutes.post("/trigger/liquidate", apiKeyAuth, async (c) => {
  try {
    const activeLoans = await db.select().from(loans).where(eq(loans.status, "active"));
    const now = new Date();
    const overdue = activeLoans.filter((loan) => {
      const endTime = new Date(loan.startTime.getTime() + loan.duration * 1000);
      return now > endTime;
    });

    if (overdue.length === 0) return ok(c, { liquidated: 0 });

    const contract = getSignedContract();
    const results = [];

    for (const loan of overdue) {
      try {
        const tx = await contract.liquidate(loan.loanId);
        const receipt = await tx.wait();
        results.push({ loanId: loan.loanId, txHash: receipt.hash });
      } catch (e: any) {
        results.push({ loanId: loan.loanId, error: e.message });
      }
    }

    return ok(c, { liquidated: results.length, results });
  } catch (e: any) {
    return err(c, e.message, 500);
  }
});
