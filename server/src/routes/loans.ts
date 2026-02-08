import { Hono } from "hono";
import { db } from "../db";
import { loans, lenderPositions } from "../db/schema";
import { eq } from "drizzle-orm";
import { ok, err } from "../lib/responses";

export const loanRoutes = new Hono();

// GET /loans/:address
loanRoutes.get("/loans/:address", async (c) => {
  try {
    const address = c.req.param("address");
    const borrowerLoans = await db.select().from(loans)
      .where(eq(loans.borrower, address));

    const lenderPos = await db.select().from(lenderPositions)
      .where(eq(lenderPositions.lender, address));

    return ok(c, { asBorrower: borrowerLoans, asLender: lenderPos });
  } catch (e: any) {
    return err(c, e.message, 500);
  }
});

// GET /loans/overdue
loanRoutes.get("/loans/overdue", async (c) => {
  try {
    const activeLoans = await db.select().from(loans)
      .where(eq(loans.status, "active"));

    const now = new Date();
    const overdue = activeLoans.filter((loan) => {
      const endTime = new Date(loan.startTime.getTime() + loan.duration * 1000);
      return now > endTime;
    });

    return ok(c, overdue);
  } catch (e: any) {
    return err(c, e.message, 500);
  }
});
