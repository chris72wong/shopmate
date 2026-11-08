import "server-only";
import type { ApiError } from "@/contracts";
import { failure } from "@/server/http";

export class ServiceError extends Error {
  constructor(public readonly status: number, public readonly error: ApiError) { super(error.message); }
}
export function invalidRequest(path: string, message: string): never {
  throw new ServiceError(422, { code: "invalid-request", message: "Check the request fields.", details: [{ path, message }] });
}
export function serviceFailure(error: unknown): Response {
  return error instanceof ServiceError ? failure(error.status, error.error)
    : failure(500, { code: "internal-error", message: "We couldn’t complete this request. Please try again." });
}
