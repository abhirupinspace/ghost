import { Hono } from "hono";
import { db } from "../db";
import { intents, loans } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { ok, err } from "../lib/responses";

export const marketRoutes = new Hono();

// GET /market/stats
marketRoutes.get("/market/stats", async (c) => {
  try {
    const lendIntents = await db.select({
      count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(${intents.amount}::numeric), 0)`,
    }).from(intents).where(eq(intents.type, "lend"));

    const borrowIntents = await db.select({
      count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(${intents.amount}::numeric), 0)`,
    }).from(intents).where(eq(intents.type, "borrow"));

    const activeLoans = await db.select({
      count: sql<number>`count(*)`,
      total: sql<string>`coalesce(sum(${loans.principal}::numeric), 0)`,
    }).from(loans).where(eq(loans.status, "active"));

    return ok(c, {
      lendSupply: { count: Number(lendIntents[0].count), total: lendIntents[0].total },
      borrowDemand: { count: Number(borrowIntents[0].count), total: borrowIntents[0].total },
      activeLoans: { count: Number(activeLoans[0].count), total: activeLoans[0].total },
    });
  } catch (e: any) {
    return err(c, e.message, 500);
  }
});

// GET /market/orderbook
marketRoutes.get("/market/orderbook", async (c) => {
  try {
    const lends = await db.select().from(intents)
      .where(eq(intents.type, "lend"));
    const borrows = await db.select().from(intents)
      .where(eq(intents.type, "borrow"));

    return ok(c, { lends, borrows });
  } catch (e: any) {
    return err(c, e.message, 500);
  }
});
