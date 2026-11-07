import type { ChainId, Country } from "@/contracts";

/** Exact grocery banners only. Pharmacies, fuel stations and name substrings do not qualify. */
export function matchChain(name: string, country: Country): ChainId | null {
  const normalized = name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
  if (/^walmart(?: supercent(?:re|er))?$/.test(normalized)) return country === "CA" ? "ca-walmart" : "us-walmart";
  if (country === "CA") {
    if (normalized === "loblaws") return "ca-loblaws";
    if (/^(?:[\p{L}][\p{L} .’'-]{0,40}['’]s )?no frills$/u.test(normalized)) return "ca-no-frills";
  } else {
    if (normalized === "aldi") return "us-aldi";
    if (/^kroger(?: marketplace)?$/.test(normalized)) return "us-kroger";
  }
  return null;
}
