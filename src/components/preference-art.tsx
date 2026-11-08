import type { ReactNode } from "react";
import type { Allergen, Diet, Country } from "@/contracts";

export type FoodArtName = Diet | Allergen | "protein" | "balanced" | "minimize-cost" | "maximize-nutrition";

/** Original, lightweight SVG illustrations; no stock photos or image library. */
export function FoodArt({ name }: { name: FoodArtName }) {
  const leaf = <><path d="M41 64C13 62 10 39 13 28c25-2 38 14 28 36Z" fill="#84AC64" /><path d="m26 43 19 25" /><path d="M44 52c-9-26 10-41 27-42 8 24-2 43-27 42Z" fill="#B7CB78" /><path d="M45 70V48l13-20" /></>;
  const wheat = <g fill="#EAC473"><path d="M42 70V20M41 51C23 52 18 41 20 35c16-1 22 7 21 16Zm2-10c17 0 22-11 20-17-15-1-22 7-20 17ZM41 35C27 33 24 22 27 17c12 1 17 8 14 18Zm2-10C33 17 36 7 42 4c9 8 11 15 1 21Zm0 32c18 1 22-9 21-15-15-2-22 6-21 15Z" /></g>;
  const art: Record<FoodArtName, ReactNode> = {
    vegetarian: <><path d="M26 31c10-15 30-7 26 6L31 72c-3 6-8 4-8-2l-5-28c-1-5 2-9 8-11Z" fill="#F3A35A" /><path d="M32 29C17 9 30 3 36 15c9-20 21-8 11 4 23-5 20 11-15 10Z" fill="#78A667" /><path d="m23 46 10 4m-6 11 8 2" /><path d="M54 60c-5-15 5-25 16-20 17-2 23 14 13 27-7 11-23 9-29-7Z" fill="#DE8062" /><path d="m67 44 2-9m-6 8 6-3 7 4" stroke="#527D4D" /></>,
    vegan: leaf,
    "gluten-free": <><path d="M15 47h58c-1 31-56 32-58 0Z" fill="#F9EDD0" /><ellipse cx="44" cy="47" rx="29" ry="10" fill="#EBC681" /><g stroke="#FFF8E4" strokeWidth="3"><path d="m26 44 4 2m6-5 3 2m7 3 3-1m9 2 4-1m-26 6 4-1m11 1 4 1" /></g><path d="M44 35V21c0-13 19-17 25-11-2 15-13 20-25 11Z" fill="#9DB575" /><path d="m48 21 12-7" /></>,
    milk: <><path d="m26 26 10-14h22l9 14v48H26V26Z" fill="#FFFBED" /><path d="m26 26 12 7h29M38 33v41M36 12l2 21 9-9 11-12" /><path d="M46 41h14v21H46z" fill="#B4D0DB" stroke="none" /><path d="M53 44c-9 11-6 14 0 14s8-4 0-14Z" fill="#FFFBED" stroke="none" /></>,
    egg: <><path d="M42 50c0 29-33 28-33 1 0-15 10-33 17-33s16 18 16 32Z" fill="#F9E6CD" /><path d="M76 52c0 30-38 30-38 0 0-17 12-37 19-37s19 20 19 37Z" fill="#FFFCF0" /><circle cx="57" cy="54" r="10" fill="#EFC56C" stroke="none" /></>,
    fish: <><path d="M61 27C42 8 16 27 11 43c6 19 32 32 50 14l18 10V19L61 27Z" fill="#A9CBD0" /><path d="M34 24c11 10 12 30 0 38m22-23 11 5-11 6" /><circle cx="24" cy="39" r="3" fill="#254D38" stroke="none" /></>,
    shellfish: <><path d="M29 22c26-11 56 17 42 40-10 18-35 18-44 4-7-10-1-19 9-17 13 2 9 13 1 10 8 13 24 3 18-7-4-10-21-5-26-12Z" fill="#F3AF94" /><path d="m30 23-9-10m12 11 2-15m0 40 6-20m8 19 8-14m-1 18 14-6m-13 16 15 1m-34 1 5 12M27 33l-13-2" /><circle cx="32" cy="30" r="2" fill="#254D38" stroke="none" /></>,
    "tree-nuts": <><path d="M49 12c32 33 28 59 5 61-27 3-31-26-5-61Z" fill="#BF8F66" /><path d="M50 25v35m9-28 2 25m-19-20-3 17" stroke="#8D6548" /><path d="M24 31C-2 47 7 75 26 74c23-3 24-28-2-43Z" fill="#E5BB88" /><path d="M24 41v22m-8-17-1 12" stroke="#AA7B54" /></>,
    peanuts: <><path d="M25 11c17-9 30 6 25 18-4 12 2 11 6 22 5 15-9 28-23 23-16-6-15-19-10-28 6-10 0-11-4-17-5-6-3-14 6-18Z" fill="#E6BF84" /><path d="m28 20 12-1m-12 7 11 1m-8 23 16 2m-16 7 16 2m-15-41 2 12m0 17 2 16m7-14 1 12" stroke="#B08A59" /><path d="M63 16c20 11 6 40-3 35-10-5 11-15 3-35Z" fill="#D2A46F" /></>,
    wheat,
    soy: <><path d="M13 62C7 32 44 7 74 14c10 28-22 62-49 57Z" fill="#9BB96D" /><path d="M22 61c8-10 27-28 43-37" stroke="#4F7850" /><g fill="#E0D9A1"><circle cx="28" cy="55" r="10" /><circle cx="45" cy="40" r="10" /><circle cx="61" cy="25" r="10" /></g></>,
    sesame: <><path d="M12 60q32-18 64 0l-5 13H17Z" fill="#E5BB85" /><path d="M24 25c13 10 11 17 4 18s-11-6-4-18Zm29-13c13 10 10 17 3 18s-11-6-3-18Zm12 24c13 9 10 17 3 18s-11-6-3-18Zm-24 4c13 9 10 17 3 18s-11-6-3-18Z" fill="#F7E5B6" /></>,
    protein: <><path d="m15 65 6-34c1-8 10-6 12 0l4 12c15-18 30-11 35 1 6 15-2 28-17 30-14 1-29-4-40-9Z" fill="#EDB58E" /><path d="M23 26 16 13l10-7 11 9-4 15m5 15c-2 6 1 12 7 13m6-16c7-1 13 6 11 11" /><path d="m62 10 1 9m12-2-7 6m12 6-9 1" stroke="#BD7546" /></>,
    balanced: <><path d="M11 44h67c-3 37-62 37-67 0Z" fill="#F9E7BB" /><ellipse cx="44" cy="43" rx="33" ry="13" fill="#E3D7A6" /><path d="M20 39c-5-15 14-25 24-12 15-13 31 1 22 13" fill="#8CAE71" /><circle cx="53" cy="43" r="9" fill="#DF8B6C" /><path d="m28 8 1 9m16-12v10m16-5-3 9" /></>,
    "minimize-cost": <><path d="M22 12h44v62l-11-5-11 5-11-5-11 5V12Z" fill="#FFFAE8" /><path d="M32 24h23M32 32h16" /><circle cx="61" cy="57" r="19" fill="#EAC66B" /><path d="M66 49h-8c-8 0-8 8 0 8h5c8 0 8 8 0 8h-9m7-20v23" /></>,
    "maximize-nutrition": leaf,
  };
  return <svg className={`food-art food-art-${name}`} viewBox="0 0 88 88" fill="none" stroke="#35533D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{art[name]}</svg>;
}

const people = [
  ["#E8AC82", "#DF8D62", "#523C31"], ["#A26C4C", "#8DAA76", "#342F2A"],
  ["#F1C8A5", "#E5C363", "#815236"], ["#C6906C", "#92B9C2", "#3F342F"],
  ["#A76B4D", "#CD8F94", "#332D29"], ["#E8B590", "#A2AD76", "#916844"],
  ["#C58962", "#B2A2C3", "#39302B"], ["#F0CBAC", "#DAA76B", "#654532"],
];

export function PersonArt({ index }: { index: number }) {
  const [skin, shirt, hair] = people[index % people.length]!;
  return <svg viewBox="0 0 56 110" fill="none" stroke="#35533D" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <ellipse cx="28" cy="105" rx="20" ry="3" fill="#254D38" opacity=".09" stroke="none" />
    <path d="m18 75-1 25h9l2-24 3 24h9l-2-25Z" fill="#536C59" />
    <path d="M18 99h-4v5h12v-5m5 0v5h13v-5h-5" fill="#F9F3E4" />
    <path d="M17 42 7 51 3 74c0 6 7 7 9 2l5-16m22-18 10 9 4 23c0 6-7 7-9 2l-5-16" fill={skin} />
    <path d="m17 41-7 9 7 12-2 16h26l-2-16 7-12-7-9-11-4Z" fill={shirt} />
    <path d="M23 32v10c3 5 7 5 10 0V32" fill={skin} />
    {index % 3 === 1 && <path d="M13 32V21c0-22 31-22 31 0v15H13Z" fill={hair} />}
    <rect x="15" y="10" width="27" height="28" rx="12" fill={skin} />
    <path d={index % 2 === 0 ? "M14 23C9 5 23 1 29 6c12-6 19 9 12 17l-5-8c-7 5-14 3-16 0l-6 8Z" : "M15 23C9 8 23 1 32 6c12 0 16 11 9 18l-4-11c-3 7-13 8-22 10Z"} fill={hair} />
    <g stroke="none" fill="#35533D"><circle cx="23" cy="26" r="1.2" /><circle cx="34" cy="26" r="1.2" /></g>
    <path d="M25 32q4 3 7-1" strokeWidth="1.3" />
    {index % 2 === 0 && <path d="M22 53h12" stroke="#FFF9EC" strokeWidth="3" />}
  </svg>;
}

export function CountryFlag({ country }: { country: Country }) {
  return <svg className="country-flag" viewBox="0 0 72 48" aria-hidden="true" focusable="false">
    <rect width="72" height="48" rx="7" fill="#FFFBF0" />
    {country === "CA" ? <><path d="M7 0h9v48H7a7 7 0 0 1-7-7V7a7 7 0 0 1 7-7ZM56 0h9a7 7 0 0 1 7 7v34a7 7 0 0 1-7 7h-9Z" fill="#CD5E4D" /><path d="m36 7 4 9 5-3-1 11 7-3-2 7 3 3-13 5 1 6h-4l1-6-14-5 3-3-3-7 7 3-1-11 5 3Z" fill="#CD5E4D" /></> : <><path d="M0 9h72M0 23h72M0 37h72" stroke="#C56559" strokeWidth="6" /><path d="M7 0h27v27H0V7a7 7 0 0 1 7-7Z" fill="#587782" /><g fill="#FFFBF0">{[9, 19, 29].map(x => [7, 15, 23].map(y => <circle key={`${x}-${y}`} cx={x - 3} cy={y - 2} r="1.7" />))}</g></>}
  </svg>;
}
