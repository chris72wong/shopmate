import { storeDiscoveryRequestSchema } from "@/contracts";
import { demoStoreDiscovery } from "@/server/discovery/demo";
import { createGoogleStoreDiscovery } from "@/server/discovery/google";
import { serviceFailure } from "@/server/errors";
import { parseBody, success } from "@/server/http";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const parsed = await parseBody(request, storeDiscoveryRequestSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const provider = parsed.data.mode === "demo" ? demoStoreDiscovery : createGoogleStoreDiscovery({ signal: request.signal });
    return success(await provider.discover(parsed.data));
  } catch (error) { return serviceFailure(error); }
}
