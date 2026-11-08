import "server-only";
import { mealGenerationRequestSchema } from "@/contracts/meal-plan";
import { parseBody, success } from "@/server/http";
import { serviceFailure } from "@/server/errors";
import { generateMeals } from "@/server/meals/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  const parsed = await parseBody(request, mealGenerationRequestSchema);
  if (!parsed.ok) return parsed.response;
  try { return success(await generateMeals(parsed.data, request.signal)); }
  catch (error) { return serviceFailure(error); }
}
