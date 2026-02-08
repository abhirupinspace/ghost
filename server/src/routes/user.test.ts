import { describe, it, expect } from "bun:test";

describe("User Routes", () => {
  it("should have lends endpoint", async () => {
    const app = (await import("../index")).default;
    const res = await app.request("/user/0x1234/lends");
    expect(res.status).toBeDefined();
  });

  it("should have borrows endpoint", async () => {
    const app = (await import("../index")).default;
    const res = await app.request("/user/0x1234/borrows");
    expect(res.status).toBeDefined();
  });

  it("should have credit endpoint", async () => {
    const app = (await import("../index")).default;
    const res = await app.request("/user/0x1234/credit");
    expect(res.status).toBeDefined();
  });

  it("should have activity endpoint", async () => {
    const app = (await import("../index")).default;
    const res = await app.request("/user/0x1234/activity");
    expect(res.status).toBeDefined();
  });
});
