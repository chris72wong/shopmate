import { readBidouDeals } from "@/server/pricing/bidou-deals";
import { invalidRequest } from "@/server/errors";
import { failureV2, successV2 } from "@/server/http-v2";

export const runtime = "nodejs";
export async function GET(request: Request): Promise<Response> {
  try {
    const query = new URL(request.url).searchParams;
    const province = query.get("province");
    if (query.getAll("country").length !== 1 || query.get("country") !== "CA" || query.getAll("province").length !== 1 || !["ON", "QC"].includes(province ?? "") || [...query.keys()].some(key => !["country", "province"].includes(key))) invalidRequest("province", "Use country=CA and province=ON or QC for the public regional deal feed.");
    return successV2(await readBidouDeals(province === "ON" ? "ON" : "QC"));
  } catch (error) { return failureV2(error); }
}
