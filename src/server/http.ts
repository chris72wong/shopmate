import "server-only";
import type { ZodType } from "zod";
import { API_CONTRACT_VERSION, type ApiError, type ApiResponse } from "@/contracts";

const headers = {
  "Cache-Control": "no-store",
  "X-ShopMate-Contract-Version": API_CONTRACT_VERSION,
};
export function success<T>(data: T, status = 200): Response {
  return Response.json({ ok: true, data } satisfies ApiResponse<T>, { status, headers });
}
export function failure(status: number, error: ApiError): Response {
  return Response.json({ ok: false, error } satisfies ApiResponse<never>, { status, headers });
}
export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<
  { ok: true; data: T } | { ok: false; response: Response }
> {
  let body: unknown;
  try { body = await request.json(); }
  catch {
    return { ok: false, response: failure(400, { code: "invalid-json", message: "Send a valid JSON request body." }) };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { ok: false, response: failure(422, {
    code: "invalid-request", message: "Check the request fields.",
    details: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  }) };
  return { ok: true, data: parsed.data };
}
