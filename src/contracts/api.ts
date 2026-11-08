import type {
  Attribution, Country, DataMode, LocationInput, NormalizedLocation,
  Coordinates, OptimizationResult, Preferences, Store,
} from "./domain";

export const API_CONTRACT_VERSION = "1";

export interface StoreDiscoveryRequest {
  mode: DataMode;
  location: LocationInput;
  radiusKm: number;
  /** Defaults to the legacy major-chain scope when omitted. */
  discoveryScope?: "major-chains" | "all-grocers";
}
export interface StoreDiscoveryResult {
  mode: DataMode;
  location: NormalizedLocation;
  origin: { label: string; coordinates: Coordinates | null };
  radiusKm: number;
  stores: Store[];
  attributions: Attribution[];
  notices: string[];
}
export interface OptimizationRequest {
  mode: DataMode;
  country: Country;
  /** Opaque IDs returned by discovery; never accept client-provided prices or chains. */
  storeIds: string[];
  preferences: Preferences;
}
export type ApiErrorCode = "invalid-json" | "invalid-request" | "not-implemented"
  | "provider-not-configured" | "provider-error" | "not-found" | "rate-limited" | "internal-error";
export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: { path: string; message: string }[];
}
export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };
export type StoreDiscoveryResponse = ApiResponse<StoreDiscoveryResult>;
export type OptimizationResponse = ApiResponse<OptimizationResult>;
