import { countrySchema } from "@/contracts";
import { catalog } from "@/server/pricing/service";
import { invalidRequest } from "@/server/errors";
import { failureV2, successV2 } from "@/server/http-v2";

export const runtime = "nodejs";
export function GET(request: Request): Response {
  try {
    const query = new URL(request.url).searchParams;
    const country = countrySchema.safeParse(query.get("country"));
    if (!country.success || query.getAll("country").length !== 1 || [...query.keys()].some(key => key !== "country")) invalidRequest("country", "Supply exactly one country: CA or US.");
    return successV2(catalog(country.data));
  } catch (error) { return failureV2(error); }
}
