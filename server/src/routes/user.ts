import { Hono } from "hono";
import { db } from "../db";
import { intents, loans, lenderPositions, activities } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { ok, err } from "../lib/responses";
import { getContract } from "../lib/contract";

export const userRoutes = new Hono();

// GET /user/:address/lends
userRoutes.get("/user/:address/lends", async (c) => {
  try {
    const address = c.req.param("address");

    const activeIntents = await db.select().from(intents)
      .where(and(eq(intents.address, address), eq(intents.type, "lend"), eq(intents.active, true)));

    const positions = await db.select().from(lenderPositions)
      .where(eq(lenderPositions.lender, address));

    let onChainBalance = "0";
    try {
      const contract = getContract();
      onChainBalance = (await contract.getLenderBalance(address)).toString();
    } catch {}

    return ok(c, { onChainBalance, activeIntents, positions });
  } catch (e: any) {
    return err(c, e.message, 500);
  }
});

// GET /user/:address/borrows
userRoutes.get("/user/:address/borrows", async (c) => {
  try {
    const address = c.req.param("address");

    const activeIntents = await db.select().from(intents)
      .where(and(eq(intents.address, address), eq(intents.type, "borrow"), eq(intents.active, true)));

    const userLoans = await db.select().from(loans)
      .where(eq(loans.borrower, address));

    let onChainCollateral = "0";
    try {
      const contract = getContract();
      onChainCollateral = (await contract.getBorrowerCollateral(address)).toString();
    } catch {}

    return ok(c, { onChainCollateral, activeIntents, loans: userLoans });
  } catch (e: any) {
    return err(c, e.message, 500);
  }
});

// GET /user/:address/credit
userRoutes.get("/user/:address/credit", async (c) => {
  try {
    const address = c.req.param("address");
    let score = 500;
    try {
      const contract = getContract();
      score = Number(await contract.getCreditScore(address));
    } catch {}

    return ok(c, { address, creditScore: score });
  } catch (e: any) {
    return err(c, e.message, 500);
  }
});

// GET /user/:address/activity
userRoutes.get("/user/:address/activity", async (c) => {
  try {
    const address = c.req.param("address");
    const acts = await db.select().from(activities)
      .where(eq(activities.address, address))
      .orderBy(desc(activities.timestamp))
      .limit(50);

    return ok(c, acts);
  } catch (e: any) {
    return err(c, e.message, 500);
  }
});
