import "server-only";
import { CATALOG_VERSION } from "@/server/pricing/service";
import { Planner } from "@/components/planner";
import { recipes } from "@/data/recipes";
import { ingredients } from "@/data/ingredients";
import { products } from "@/data/pricing";

export default function Home() {
  return <Planner catalogVersion={CATALOG_VERSION} recipes={recipes} ingredients={ingredients} products={products} />;
}
