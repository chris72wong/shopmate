import "server-only";
import type { Metadata } from "next";
import { CATALOG_VERSION } from "@/server/pricing/service";
import { Planner } from "@/components/planner";
import { recipes } from "@/data/recipes";
import { ingredients } from "@/data/ingredients";
import { products } from "@/data/pricing";

export const metadata: Metadata = { title: "Make a plan" };

export default function PlanPage() {
  return <Planner catalogVersion={CATALOG_VERSION} recipes={recipes} ingredients={ingredients} products={products} />;
}
