import { describe, expect, it } from "vitest";
import { POST as discover } from "@/app/api/stores/route";
import { POST as optimize } from "@/app/api/optimize/route";
import { GET as health } from "@/app/api/health/route";
import { jsonRequest, optimizationRequest } from "./fixtures";

describe("API route contracts", () => {
  it("reports only implemented capabilities", async () => {
    const response = health();
    expect(response.status).toBe(200);
    expect((await response.json()).data.capabilities).toEqual({ demoDiscovery: true, liveDiscovery: false, optimization: false });
  });
  it.each(["CA", "US"])("serves explicit %s demo discovery without credentials", async (country) => {
    const response = await discover(jsonRequest("/api/stores", { mode: "demo", location: {
      country, postalCode: country === "CA" ? "m5v2t6" : "02108",
    } }));
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-ShopMate-Contract-Version")).toBe("1");
    const body = await response.json();
    expect(body.ok).toBe(true); expect(body.data.mode).toBe("demo");
    expect(body.data.location.currency).toBe(country === "CA" ? "CAD" : "USD");
  });
  it("never silently substitutes demo results for live discovery", async () => {
    const response = await discover(jsonRequest("/api/stores", { mode: "live", location: { country: "US", postalCode: "14201" } }));
    expect(response.status).toBe(501);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "not-implemented" } });
  });
  it.each([discover, optimize])("rejects malformed JSON", async (handler) => {
    const response = await handler(new Request("http://localhost/api", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "invalid-json" } });
  });
  it("returns field paths for validation errors", async () => {
    const response = await discover(jsonRequest("/api/stores", { mode: "demo", location: { country: "CA", postalCode: "wrong" } }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "invalid-request", details: [{ path: "location.postalCode" }] } });
  });
  it("reserves optimization honestly and still validates input first", async () => {
    const valid = await optimize(jsonRequest("/api/optimize", optimizationRequest()));
    expect(valid.status).toBe(501); expect(await valid.json()).toMatchObject({ ok: false, error: { code: "not-implemented" } });
    const invalid = await optimize(jsonRequest("/api/optimize", { ...optimizationRequest(), storeIds: [] }));
    expect(invalid.status).toBe(422);
  });
});
