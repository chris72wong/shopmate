import { success } from "@/server/http";

export function GET(): Response {
  return success({ application: "ShopMate", version: "0.1.0", stage: "foundation",
    capabilities: { demoDiscovery: true, liveDiscovery: true, optimization: true } });
}
