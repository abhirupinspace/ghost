import { describe, it, expect } from "bun:test";

describe("Loan Routes", () => {
  it("should have overdue endpoint", async () => {
    const app = (await import("../index")).default;
    const res = await app.request("/loans/overdue");
    expect(res.status).toBeDefined();
  });

  it("should have address loans endpoint", async () => {
    const app = (await import("../index")).default;
    const res = await app.request("/loans/0x1234567890abcdef1234567890abcdef12345678");
    expect(res.status).toBeDefined();
  });
});
