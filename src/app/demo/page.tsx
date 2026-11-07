import "server-only";
import type { Metadata } from "next";
import { Planner } from "@/components/planner";
import { recipes } from "@/data/recipes";
import { ingredients } from "@/data/ingredients";
import { products } from "@/data/pricing";

export const metadata: Metadata = { title: "Sample experience" };

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ country?: string }> }) {
  const query = await searchParams;
  const country = query.country === "US" ? "US" : "CA";
  return <Planner key={country} initialMode="demo" initialCountry={country} recipes={recipes} ingredients={ingredients} products={products} />;
}
