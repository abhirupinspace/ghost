import { ethers } from "ethers";
import { db } from "../db";
import { loans, lenderPositions, activities } from "../db/schema";
import { eq } from "drizzle-orm";
import { provider, getContract, GHOST_LENDING_ABI } from "../lib/contract";

export async function startIndexer() {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress) {
    console.log("[indexer] CONTRACT_ADDRESS not set, skipping");
    return;
  }

  const contract = getContract();
  console.log("[indexer] listening to events on", contractAddress);

  // LendDeposited
  contract.on("LendDeposited", async (lender: string, amount: bigint, event: any) => {
    console.log(`[indexer] LendDeposited: ${lender} ${ethers.formatEther(amount)}`);
    await db.insert(activities).values({
      address: lender,
      type: "deposit_lend",
      amount: ethers.formatEther(amount),
      txHash: event.log.transactionHash,
    });
  });

  // LendWithdrawn
  contract.on("LendWithdrawn", async (lender: string, amount: bigint, event: any) => {
    console.log(`[indexer] LendWithdrawn: ${lender} ${ethers.formatEther(amount)}`);
    await db.insert(activities).values({
      address: lender,
      type: "withdraw_lend",
      amount: ethers.formatEther(amount),
      txHash: event.log.transactionHash,
    });
  });

  // CollateralDeposited
  contract.on("CollateralDeposited", async (borrower: string, amount: bigint, event: any) => {
    console.log(`[indexer] CollateralDeposited: ${borrower} ${ethers.formatEther(amount)}`);
    await db.insert(activities).values({
      address: borrower,
      type: "deposit_collateral",
      amount: ethers.formatEther(amount),
      txHash: event.log.transactionHash,
    });
  });

  // CollateralWithdrawn
  contract.on("CollateralWithdrawn", async (borrower: string, amount: bigint, event: any) => {
    console.log(`[indexer] CollateralWithdrawn: ${borrower} ${ethers.formatEther(amount)}`);
    await db.insert(activities).values({
      address: borrower,
      type: "withdraw_collateral",
      amount: ethers.formatEther(amount),
      txHash: event.log.transactionHash,
    });
  });

  // LoanCreated
  contract.on("LoanCreated", async (loanId: bigint, borrower: string, principal: bigint, event: any) => {
    console.log(`[indexer] LoanCreated: #${loanId} borrower=${borrower} principal=${ethers.formatEther(principal)}`);

    try {
      const loanData = await contract.getLoan(loanId);
      const lenders = await contract.getLoanLenders(loanId);

      await db.insert(loans).values({
        loanId: Number(loanId),
        borrower,
        principal: ethers.formatEther(principal),
        collateralAmount: ethers.formatEther(loanData[2]),
        rate: Number(loanData[3]),
        duration: Number(loanData[4]),
        startTime: new Date(Number(loanData[5]) * 1000),
        seniorLenders: lenders[0] as string[],
        seniorAmounts: (lenders[1] as bigint[]).map((a) => ethers.formatEther(a)),
        juniorLenders: lenders[2] as string[],
        juniorAmounts: (lenders[3] as bigint[]).map((a) => ethers.formatEther(a)),
        status: "active",
      });

      // Create lender positions
      for (let i = 0; i < lenders[0].length; i++) {
        await db.insert(lenderPositions).values({
          loanId: Number(loanId),
          lender: lenders[0][i],
          amount: ethers.formatEther(lenders[1][i]),
          tranche: "senior",
        });
      }
      for (let i = 0; i < lenders[2].length; i++) {
        await db.insert(lenderPositions).values({
          loanId: Number(loanId),
          lender: lenders[2][i],
          amount: ethers.formatEther(lenders[3][i]),
          tranche: "junior",
        });
      }

      await db.insert(activities).values({
        address: borrower,
        type: "loan_created",
        amount: ethers.formatEther(principal),
        txHash: event.log.transactionHash,
        details: { loanId: Number(loanId) },
      });
    } catch (e) {
      console.error("[indexer] Error processing LoanCreated:", e);
    }
  });

  // LoanRepaid
  contract.on("LoanRepaid", async (loanId: bigint, borrower: string, totalPaid: bigint, event: any) => {
    console.log(`[indexer] LoanRepaid: #${loanId}`);
    await db.update(loans).set({ status: "repaid" }).where(eq(loans.loanId, Number(loanId)));
    await db.update(lenderPositions).set({ status: "repaid" }).where(eq(lenderPositions.loanId, Number(loanId)));
    await db.insert(activities).values({
      address: borrower,
      type: "loan_repaid",
      amount: ethers.formatEther(totalPaid),
      txHash: event.log.transactionHash,
      details: { loanId: Number(loanId) },
    });
  });

  // LoanDefaulted
  contract.on("LoanDefaulted", async (loanId: bigint, borrower: string, event: any) => {
    console.log(`[indexer] LoanDefaulted: #${loanId}`);
    await db.update(loans).set({ status: "defaulted" }).where(eq(loans.loanId, Number(loanId)));
    await db.update(lenderPositions).set({ status: "defaulted" }).where(eq(lenderPositions.loanId, Number(loanId)));
    await db.insert(activities).values({
      address: borrower,
      type: "loan_defaulted",
      txHash: event.log.transactionHash,
      details: { loanId: Number(loanId) },
    });
  });
}
