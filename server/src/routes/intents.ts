import { Hono } from "hono";
import { db } from "../db";
import { intents } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { ok, err } from "../lib/responses";

export const intentRoutes = new Hono();

// POST /intent/lend
intentRoutes.post("/intent/lend", async (c) => {
  try {
    const body = await c.req.json();
    const { address, amount, minRate, duration, tranche, signature } = body;
    if (!address || !amount || !duration) return err(c, "missing fields");

    const [intent] = await db.insert(intents).values({
      address,
      amount: String(amount),
      minRate: minRate ? String(minRate) : null,
      maxRate: null,
      duration,
      tranche: tranche || "senior",
      type: "lend",
      signature: signature || null,
    }).returning();

    return ok(c, intent);
  } catch (e: any) {
    return err(c, e.message, 500);
  }
});

// POST /intent/borrow
intentRoutes.post("/intent/borrow", async (c) => {
  try {
    const body = await c.req.json();
    const { address, amount, maxRate, duration, signature } = body;
    if (!address || !amount || !duration) return err(c, "missing fields");

    const [intent] = await db.insert(intents).values({
      address,
      amount: String(amount),
      minRate: null,
      maxRate: maxRate ? String(maxRate) : null,
      duration,
      tranche: null,
      type: "borrow",
      signature: signature || null,
    }).returning();

    return ok(c, intent);
  } catch (e: any) {
    return err(c, e.message, 500);
  }
});

// DELETE /intent/:id
intentRoutes.delete("/intent/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"));
    const [updated] = await db.update(intents)
      .set({ active: false })
      .where(eq(intents.id, id))
      .returning();
    if (!updated) return err(c, "not found", 404);
    return ok(c, updated);
  } catch (e: any) {
    return err(c, e.message, 500);
  }
});

// GET /intents/:address
intentRoutes.get("/intents/:address", async (c) => {
  try {
    const address = c.req.param("address");
    const results = await db.select().from(intents)
      .where(and(eq(intents.address, address), eq(intents.active, true)));
    return ok(c, results);
  } catch (e: any) {
    return err(c, e.message, 500);
  }
});
