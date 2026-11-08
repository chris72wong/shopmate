import type { ReactNode } from "react";
import type { Recipe } from "@/contracts";

export type IconName = "arrow" | "pin" | "receipt" | "basket" | "check" | "leaf" | "bowl" | "list";

/** ShopMate's original line icons. The surrounding control supplies the accessible name. */
export function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    arrow: <path d="M4 12h15M13 5l7 7-7 7" />,
    pin: <><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    receipt: <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6M9 16h2" />,
    basket: <path d="m3 9 3 12h12l3-12H3Zm4 0 5-7 5 7M9 13v4M15 13v4" />,
    check: <path d="m5 12 4 4L19 6" />,
    leaf: <path d="M20 3C9 2 2 7 5 15c7 7 15 0 15-12ZM5 20l10-11" />,
    bowl: <path d="M3 11h18a9 9 0 0 1-18 0ZM7 21h10M8 3c-2 2 2 3 0 5M14 2c-2 2 2 3 0 5" />,
    list: <><rect x="5" y="4" width="14" height="18" rx="2" /><path d="M9 2h6v4H9zM9 11h6M9 15h6M9 19h3" /></>,
  };
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}

/** Original vector groceries; no outside artwork or animation library. */
export function GroceryTote({ className = "" }: { className?: string }) {
  return <svg className={`grocery-tote ${className}`} viewBox="0 0 560 540" fill="none" aria-hidden="true" focusable="false">
    <path d="M85 187C94 77 219 20 328 62c117-37 221 76 184 188 39 143-68 235-179 211C177 514 35 418 79 310c-35-46-37-84 6-123Z" fill="#F4CFAC" />
    <ellipse cx="287" cy="470" rx="196" ry="40" fill="#BFD6E6" />
    <ellipse cx="287" cy="490" rx="178" ry="15" fill="#254D38" opacity=".1" />
    <g className="art-float-slow" stroke="#254D38" strokeWidth="3" strokeLinejoin="round">
      <path d="M163 298 112 142c-12-37-7-66 12-73 21-8 40 13 50 46l55 159Z" fill="#EEB25E" />
      <path d="m126 109 32-7m-20 43 32-8m-20 44 32-8m-19 44 32-8" stroke="#AF6C3E" strokeWidth="8" strokeLinecap="round" />
    </g>
    <g className="art-float" stroke="#254D38" strokeWidth="3" strokeLinejoin="round">
      <path d="m339 265 39-117 27 4-12 131Z" fill="#9CB77E" />
      <path d="M371 175c-32 11-53-15-44-39-30-22-15-58 16-58 1-40 49-52 68-22 30-15 61 7 55 35 35 20 20 65-14 66-8 35-53 41-66 12Z" fill="#53964D" />
      <path d="m378 144 17-42m-6 18-29-12m28 32 35-18" stroke="#9CB77E" strokeLinecap="round" />
    </g>
    <g transform="rotate(10 289 235)" stroke="#254D38" strokeWidth="3" strokeLinejoin="round">
      <path d="m247 168 18-30h48l19 30v131h-85V168Z" fill="#FBFAEF" />
      <path d="m247 168 22 14h63m-63 0v117m-4-161 4 44 16-14 28-30" />
      <path d="M286 211h31v34h-31z" fill="#C6D9E0" stroke="none" /><path d="M301 215c-14 16-12 22 0 22s14-6 0-22Z" fill="#FBFAEF" stroke="none" />
    </g>
    <g transform="rotate(-16 405 235)" stroke="#254D38" strokeWidth="3" strokeLinejoin="round">
      <path d="M393 185c19-11 42 0 36 23l-25 90c-3 8-10 10-14 0l-23-82c-5-18 8-31 26-31Z" fill="#F79942" />
      <path d="M393 186c-25-20-18-42-4-34 0-26 23-20 19 0 20-10 28 8-15 34Z" fill="#719A63" />
      <path d="m377 217 15 5m9 22 15-6m-28 30 11 3" stroke="#B76440" strokeLinecap="round" />
    </g>
    <g stroke="#254D38" strokeWidth="3" strokeLinejoin="round">
      <path d="m143 258 16 197c2 20 14 29 34 29h184c20 0 33-10 35-29l16-197H143Z" fill="#F6D46D" />
      <path d="m143 258 30 17h225l30-17M173 275l12 209m213-209-12 209" stroke="#BFA773" />
      <path d="M221 296v-62c0-76 125-76 125 0v62" stroke="#254D38" strokeWidth="13" strokeLinecap="round" />
      <path d="M221 296v-62c0-76 125-76 125 0v62" stroke="#FCF8E9" strokeWidth="6" strokeLinecap="round" />
      <rect x="205" y="339" width="163" height="94" rx="7" fill="#254D38" />
      <path d="M272 375c-7-22 14-27 25-28 2 19-6 31-25 28Zm-6 13 20-27" stroke="#DBE6C9" strokeWidth="3" strokeLinecap="round" />
      <text x="286" y="411" fill="#FFF8E8" stroke="none" textAnchor="middle" fontSize="25" fontWeight="750" fontFamily="inherit" letterSpacing="-1">shopmate.</text>
    </g>
    <g className="art-float" transform="translate(68 365)" stroke="#254D38" strokeWidth="3" strokeLinejoin="round">
      <path d="M6 35C-4 7 18-6 37 4 58-11 80 4 78 28c14 27-8 53-31 48C24 86 0 65 6 35Z" fill="#EB724E" />
      <path d="m36 9-15 9 21-2 14 10-6-17 10-9-19 5-7-14Z" fill="#648B58" /><path d="M19 32c-3 7-3 11-1 15" stroke="#F9BD9E" strokeWidth="5" strokeLinecap="round" />
      <circle cx="33" cy="40" r="2.5" fill="#254D38" stroke="none" /><circle cx="53" cy="40" r="2.5" fill="#254D38" stroke="none" /><path d="M35 52q8 8 16 0" strokeWidth="2.5" strokeLinecap="round" />
    </g>
    <g className="art-float-slow" transform="translate(424 340) rotate(25)" stroke="#254D38" strokeWidth="3">
      <path d="M0 30C-8 7 17-9 34-4c20-11 52 8 46 32 5 22-20 38-40 32C18 66-4 51 0 30Z" fill="#F4CC42" />
      <path d="M38 0c1-16 9-27 24-26-1 17-10 28-24 26Z" fill="#72966A" /><path d="M13 20c2-8 7-12 14-13" stroke="#FFF0AE" strokeWidth="5" strokeLinecap="round" />
      <circle cx="34" cy="28" r="2.5" fill="#254D38" stroke="none" /><circle cx="51" cy="28" r="2.5" fill="#254D38" stroke="none" /><path d="M35 39q7 7 14 0" strokeWidth="2.5" strokeLinecap="round" />
    </g>
  </svg>;
}

export type MealArtKind = "breakfast" | "pasta" | "soup" | "bowl" | "skillet";

export function recipeArtKind(recipe: Pick<Recipe, "id" | "illustration">): MealArtKind {
  if (recipe.id.includes("oats") || recipe.id.includes("breakfast")) return "breakfast";
  if (recipe.id.includes("pasta")) return "pasta";
  return recipe.illustration === "soup" ? "soup" : recipe.illustration === "skillet" ? "skillet" : "bowl";
}

export function MealArt({ kind = "bowl", className = "" }: { kind?: MealArtKind; className?: string }) {
  return <svg className={`meal-art ${className}`} viewBox="0 0 240 180" fill="none" aria-hidden="true" focusable="false">
    <rect width="240" height="180" rx="20" fill={kind === "soup" ? "#F3D7B9" : kind === "breakfast" ? "#F2E5C9" : "#DFE8D4"} />
    <path d="M0 137h240M0 143h240" stroke="#254D38" strokeOpacity=".08" />
    <ellipse cx="120" cy="136" rx="78" ry="10" fill="#254D38" opacity=".1" />
    <g stroke="#254D38" strokeWidth="2.4" strokeLinejoin="round">
      <path d="M41 82c3 69 151 69 158 0" fill="#FFF9E9" /><ellipse cx="120" cy="82" rx="79" ry="44" fill="#FCF6E7" />
      <ellipse cx="120" cy="82" rx="65" ry="32" fill={kind === "soup" ? "#DB9160" : kind === "breakfast" ? "#DFC591" : kind === "pasta" ? "#EBBE6C" : "#E4CFA1"} />
      {kind === "pasta" ? <g stroke="#B77839" strokeWidth="4" strokeLinecap="round"><path d="M80 70c-22 30 41 29 13 8-17-12 32-28 18-3s29 28 24 1 26-1 20 11 22 10 13-11M75 94c15 19 34 14 25-4m18 8c5 16 28 10 29-3" /></g> : null}
      {kind === "breakfast" ? <g fill="#F6E8AE" stroke="#C4985D"><circle cx="91" cy="75" r="13" /><circle cx="112" cy="83" r="13" /><circle cx="135" cy="88" r="13" /><circle cx="158" cy="84" r="13" /><path d="m89 71 4 7m17 1 4 7m19-1 4 6m19-10 4 7" /></g> : kind === "soup" ? <g fill="#F4C486" stroke="none"><path d="m81 71 14-5 4 13-14 5Zm51 18 14-4 4 13-14 4Zm22-24 11 4-3 11-12-3Z" /><circle cx="109" cy="92" r="4" /><circle cx="124" cy="66" r="4" /></g> : <>
        <path d="M78 62c-13-1-14 11-6 16-16 8-8 21 4 19 0 11 17 13 21 3l11-21-14-20c-3-7-12-5-16 3Z" fill="#6F965E" />
        <path d="m80 74 17 19m-14-8 7-12" stroke="#D0DDB7" />
        <g fill="#D87752"><circle cx="145" cy="68" r="13" /><circle cx="165" cy="84" r="12" /></g>
        <path d="m140 63 10 10m0-10-10 10m20 6 10 10m0-10-10 10" stroke="#F5B680" />
        <g fill="#F7E0A6" stroke="#B99B5E"><circle cx="115" cy="68" r="6" /><circle cx="122" cy="82" r="6" /><circle cx="108" cy="91" r="6" /><circle cx="134" cy="99" r="6" /></g>
      </>}
      <g stroke="#51764D" strokeWidth="3" strokeLinecap="round"><path d="m104 52 5 6m39 49 5-5m-32 0-4 5" /></g>
      {kind === "soup" && <g stroke="#8B9579" strokeLinecap="round"><path d="M99 31c-11-9 10-15 0-24m31 24c-11-9 10-15 0-24m29 24c-11-9 10-15 0-24" /></g>}
      <path d="m206 57-17 65m7-74 10 9 14-4" strokeLinecap="round" />
    </g>
  </svg>;
}
