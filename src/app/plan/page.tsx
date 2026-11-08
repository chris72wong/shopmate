import type { Metadata } from "next";
import { MealPlanner } from "@/components/meal-planner";
import "../meal-planner.css";

export const metadata: Metadata = { title: "Make a plan" };

export default function PlanPage() {
  return <MealPlanner />;
}
