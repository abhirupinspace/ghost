import { Hono } from "hono";
import { apiKeyAuth } from "../lib/auth";
import { ok, err } from "../lib/responses";
import { clearMarket } from "../services/clearing";
import { db } from "../db";
import { loans } from "../db/schema";
import { eq } from "drizzle-orm";
import { writeContract, readContract } from "../lib/contract";
import { processLoanCreated, processLoanDefaulted } from "../services/event-handlers";
import type { Address } from "viem";

export const triggerRoutes = new Hono();

// POST /trigger/settle — match intents and execute loans
triggerRoutes.post("/trigger/settle", apiKeyAuth, async (c) => {
  try {
    const matches = await clearMarket();
    if (matches.length === 0) return ok(c, { matched: 0 });

    const results = [];

    for (const match of matches) {
      try {
        const { hash } = await writeContract("executeLoan", [
          match.borrower,
          match.seniorLenders,
          match.seniorAmounts,
          match.juniorLenders,
          match.juniorAmounts,
          match.principal,
          match.collateralAmount,
          BigInt(Math.round(match.rate)),
          BigInt(match.duration),
        ]);
        // Read loanId directly from contract state (reliable, no event decoding)
        const loanCount = await readContract<bigint>("loanCount", []);
        await processLoanCreated(
          BigInt(Number(loanCount) - 1),
          match.borrower as Address,
          match.principal,
          hash,
        );
        results.push({ borrower: match.borrower, principal: match.principal.toString(), txHash: hash });
      } catch (e: any) {
        console.error("[settle] loan execution failed:", match.borrower, e);
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

    const results = [];

    for (const loan of overdue) {
      try {
        const { hash } = await writeContract("liquidate", [loan.loanId]);
        await processLoanDefaulted(BigInt(loan.loanId), loan.borrower as Address, hash);
        results.push({ loanId: loan.loanId, txHash: hash });
      } catch (e: any) {
        console.error("[liquidate] failed:", loan.loanId, e);
        results.push({ loanId: loan.loanId, error: e.message });
      }
    }

    return ok(c, { liquidated: results.length, results });
  } catch (e: any) {
    return err(c, e.message, 500);
  }
});
