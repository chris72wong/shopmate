import type { OptimizationRequest, OptimizationResult, Store } from "@/contracts";
import type { GroceryPricingProvider } from "@/server/pricing/provider";

/** Agent C implements this pure, deterministic boundary in its worktree. */
export interface OptimizationEngine {
  optimize(
    request: OptimizationRequest,
    stores: readonly Store[],
    pricing: GroceryPricingProvider,
  ): Promise<OptimizationResult>;
}
