import { storeDiscoveryRequestSchema } from "@/contracts";
import { demoStoreDiscovery } from "@/server/discovery/demo";
import { failure, parseBody, success } from "@/server/http";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const parsed = await parseBody(request, storeDiscoveryRequestSchema);
  if (!parsed.ok) return parsed.response;
  if (parsed.data.mode === "live") {
    return failure(501, { code: "not-implemented",
      message: "Live Google store discovery is not implemented in the foundation. Use explicit demo mode." });
  }
  return success(await demoStoreDiscovery.discover(parsed.data));
}
