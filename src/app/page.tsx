import "server-only";
import { Planner } from "@/components/planner";
import { recipes } from "@/data/recipes";
import { ingredients } from "@/data/ingredients";
import { products } from "@/data/pricing";

export default function Home() {
  return <Planner recipes={recipes} ingredients={ingredients} products={products} />;
}
