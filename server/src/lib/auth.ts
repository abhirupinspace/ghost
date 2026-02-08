import type { Context, Next } from "hono";

export const apiKeyAuth = async (c: Context, next: Next) => {
  const apiKey = c.req.header("x-api-key");
  const expected = process.env.API_KEY || "ghost-secret-key";
  if (apiKey !== expected) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
};
