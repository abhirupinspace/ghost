import type { Context } from "hono";

export const ok = (c: Context, data: any) => c.json({ ok: true, data });
export const err = (c: Context, message: string, status: number = 400) =>
  c.json({ ok: false, error: message }, status as any);
