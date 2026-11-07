import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as discover } from "@/app/api/stores/route";
import { POST as optimize } from "@/app/api/optimize/route";
import { demoStoreDiscovery } from "@/server/discovery/demo";
import { jsonRequest, optimizationRequest } from "./fixtures";

describe("backend HTTP error and live identity boundaries", () => {
  beforeEach(() => vi.stubEnv("GOOGLE_MAPS_API_KEY", "synthetic-private-key"));
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  const input = { mode: "live", location: { country: "US", postalCode: "02108" }, radiusKm: 5 };
  it.each([[429, 429, "rate-limited"], [500, 502, "provider-error"], [403, 502, "provider-error"]])("maps upstream HTTP %s to a sanitized contract envelope", async (upstream, status, code) => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response("private key or provider payload", { status: Number(upstream) })));
    const response = await discover(jsonRequest("/api/stores", input));
    expect(response.status).toBe(status); expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json(); expect(body).toMatchObject({ ok: false, error: { code } });
    expect(JSON.stringify(body)).not.toMatch(/synthetic-private-key|provider payload/);
  });
  it("maps an unresolved postal code to 404 rather than a successful sample result", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json({ status: "ZERO_RESULTS", results: [] })));
    const response = await discover(jsonRequest("/api/stores", input));
    expect(response.status).toBe(404); expect(await response.json()).toMatchObject({ ok: false, error: { code: "not-found" } });
  });
  it("rejects selected live stores that re-resolve into the wrong country", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(Response.json({ id: "synthetic", displayName: { text: "Synthetic grocery" }, formattedAddress: "Synthetic address only", addressComponents: [{ types: ["country"], shortText: "US" }],
      location: { latitude: 0, longitude: 0 }, googleMapsUri: "https://maps.google.com/", types: ["grocery_store"] })));
    const response = await optimize(jsonRequest("/api/optimize", { ...optimizationRequest(), mode: "live", storeIds: ["google:synthetic"] }));
    expect(response.status).toBe(422); expect(await response.json()).toMatchObject({ ok: false, error: { code: "invalid-request", details: [{ path: "storeIds" }] } });
  });
  it("sanitizes unexpected internal exceptions", async () => {
    vi.spyOn(demoStoreDiscovery, "discover").mockRejectedValueOnce(new Error("private internal payload"));
    const response = await discover(jsonRequest("/api/stores", { ...input, mode: "demo" }));
    expect(response.status).toBe(500); const body = await response.json();
    expect(body).toMatchObject({ ok: false, error: { code: "internal-error" } }); expect(JSON.stringify(body)).not.toContain("private internal payload");
  });
});
