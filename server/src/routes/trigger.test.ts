import { describe, it, expect } from "bun:test";

describe("Trigger Routes", () => {
  it("should reject settle without api key", async () => {
    const app = (await import("../index")).default;
    const res = await app.request("/trigger/settle", { method: "POST" });
    const json = await res.json();
    expect(json.error).toBe("unauthorized");
  });

  it("should reject liquidate without api key", async () => {
    const app = (await import("../index")).default;
    const res = await app.request("/trigger/liquidate", { method: "POST" });
    const json = await res.json();
    expect(json.error).toBe("unauthorized");
  });
});
