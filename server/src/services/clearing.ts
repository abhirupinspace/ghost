import { db } from "../db";
import { intents } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { readContract } from "../lib/contract";

export interface LoanMatch {
  borrower: string;
  seniorLenders: string[];
  seniorAmounts: bigint[];
  juniorLenders: string[];
  juniorAmounts: bigint[];
  principal: bigint;
  collateralAmount: bigint;
  rate: number;
  duration: number;
}

export async function clearMarket(): Promise<LoanMatch[]> {
  const lendIntents = await db.select().from(intents)
    .where(and(eq(intents.type, "lend"), eq(intents.active, true)));
  const borrowIntents = await db.select().from(intents)
    .where(and(eq(intents.type, "borrow"), eq(intents.active, true)));

  if (lendIntents.length === 0 || borrowIntents.length === 0) return [];

  const matches: LoanMatch[] = [];
  const usedLendIds = new Set<number>();

  for (const borrow of borrowIntents) {
    const borrowAmount = BigInt(borrow.amount);
    const borrowMaxRate = borrow.maxRate ? Number(borrow.maxRate) : 10000;

    const seniorLenders: string[] = [];
    const seniorAmounts: bigint[] = [];
    const juniorLenders: string[] = [];
    const juniorAmounts: bigint[] = [];
    let filled = 0n;

    const availableLends = lendIntents
      .filter((l) => !usedLendIds.has(l.id) && l.address !== borrow.address)
      .sort((a, b) => Number(a.minRate || 0) - Number(b.minRate || 0));

    for (const lend of availableLends) {
      if (filled >= borrowAmount) break;

      const lendRate = Number(lend.minRate || 0);
      if (lendRate > borrowMaxRate) continue;

      if (lend.duration < borrow.duration) continue;

      const lendAmount = BigInt(lend.amount);
      const toFill = borrowAmount - filled < lendAmount ? borrowAmount - filled : lendAmount;

      if (lend.tranche === "senior") {
        seniorLenders.push(lend.address);
        seniorAmounts.push(toFill);
      } else {
        juniorLenders.push(lend.address);
        juniorAmounts.push(toFill);
      }

      filled += toFill;
      usedLendIds.add(lend.id);
    }

    if (filled < borrowAmount) continue;

    let weightedRate = 0n;
    const allAmounts = [...seniorAmounts, ...juniorAmounts];
    const allRates = [
      ...seniorLenders.map((_, i) => {
        const lend = lendIntents.find((l) => l.address === seniorLenders[i]);
        return BigInt(Math.round(Number(lend?.minRate || 0)));
      }),
      ...juniorLenders.map((_, i) => {
        const lend = lendIntents.find((l) => l.address === juniorLenders[i]);
        return BigInt(Math.round(Number(lend?.minRate || 0)));
      }),
    ];

    for (let i = 0; i < allAmounts.length; i++) {
      weightedRate += allAmounts[i] * allRates[i];
    }
    const avgRate = filled > 0n ? Number(weightedRate / filled) : 500;

    let collateralAmount: bigint;
    try {
      collateralAmount = await readContract<bigint>("getRequiredCollateral", [borrow.address, borrowAmount]);
    } catch {
      collateralAmount = (borrowAmount * 15000n) / 10000n;
    }

    matches.push({
      borrower: borrow.address,
      seniorLenders,
      seniorAmounts,
      juniorLenders,
      juniorAmounts,
      principal: borrowAmount,
      collateralAmount,
      rate: avgRate,
      duration: borrow.duration,
    });

    await db.update(intents).set({ active: false }).where(eq(intents.id, borrow.id));
  }

  for (const id of usedLendIds) {
    await db.update(intents).set({ active: false }).where(eq(intents.id, id));
  }

  return matches;
}
