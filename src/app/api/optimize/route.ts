import { optimizationRequestSchema } from "@/contracts";
import { failure, parseBody } from "@/server/http";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const parsed = await parseBody(request, optimizationRequestSchema);
  if (!parsed.ok) return parsed.response;
  return failure(501, { code: "not-implemented",
    message: "Meal optimization is not implemented in the foundation. This endpoint is reserved for Agent C." });
}
