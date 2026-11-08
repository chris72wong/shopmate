import "server-only";
import type { ZodType } from "zod";
import type { ApiResponse } from "@/contracts";
import { parseBody } from "@/server/http";
import { serviceFailure } from "@/server/errors";

export function version2(response: Response): Response { response.headers.set("X-ShopMate-Contract-Version", "2"); return response; }
export function successV2<T>(data: T): Response { return Response.json({ ok: true, data } satisfies ApiResponse<T>, { headers: { "Cache-Control": "no-store", "X-ShopMate-Contract-Version": "2" } }); }
export async function bodyV2<T>(request: Request, schema: ZodType<T>) {
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return { ok: false as const, response: version2(parsed.response) };
  return parsed;
}
export function failureV2(error: unknown): Response { return version2(serviceFailure(error)); }
