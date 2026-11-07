import type { Recipe } from "@/contracts";

/** Original local SVG artwork. No remote assets, tracking, or image service required. */
export function FoodIllustration({ variant = "grain-bowl" }: { variant?: Recipe["illustration"] }) {
  const isSoup = variant === "soup";
  const isSkillet = variant === "skillet";
  return <svg viewBox="0 0 440 350" fill="none" aria-hidden="true" className="food-illustration">
    <ellipse cx="225" cy="294" rx="148" ry="20" fill="#294B37" opacity=".08" />
    <path d="m358 76 16-38M366 79l31-23M360 65l-6-25" stroke="#78916A" strokeWidth="4" strokeLinecap="round" />
    <path d="M365 78c-27-4-35 10-33 20 20 5 32-3 33-20ZM370 66c2-25 18-30 27-25 0 18-10 28-27 25Z" fill="#78916A" />
    {isSkillet && <path d="m310 197 85 39" stroke="#3F4D3E" strokeWidth="26" strokeLinecap="round" />}
    <circle cx="214" cy="174" r="141" fill={isSkillet ? "#475443" : "#FDFCF6"} />
    <circle cx="214" cy="174" r="123" stroke={isSkillet ? "#66705B" : "#E6E4D8"} strokeWidth="2" />
    <circle cx="214" cy="174" r="111" fill={isSoup ? "#D69450" : isSkillet ? "#CEAB76" : "#DED7AF"} />
    {!isSoup && <>
      <path d="M134 124c-17-13-37 0-31 17-20 8-12 30 4 32-15 17-1 34 16 27-4 22 17 30 29 14 12 15 29 4 26-12 21 2 27-20 9-30 12-19-2-35-18-26 0-19-24-26-35-22Z" fill="#567B44" />
      <path d="m116 158 48 27m-38-46 16 59m-33-18 59-17" stroke="#9DB17A" strokeWidth="3" strokeLinecap="round" />
      <path d="m228 87 42 11-13 39-42-11 13-39Zm42 58 40 15-14 38-41-13 15-40Zm-64-8 40 11-10 37-42-11 12-37Z" fill="#EDCB86" stroke="#D8AE64" strokeWidth="2" />
      <path d="m230 92 33 9m11 49 30 13m-94-20 29 9" stroke="#F9E4B5" strokeWidth="3" strokeLinecap="round" />
      <path d="M169 231c-12-39 12-67 37-59 27 8 26 40 11 64l-48-5Z" fill="#8B9E58" />
      <path d="M177 228c-7-27 8-48 25-43 18 6 18 26 8 45l-33-2Z" fill="#C4D091" />
      <ellipse cx="194" cy="213" rx="9" ry="14" transform="rotate(15 194 213)" fill="#A4B472" />
      <path d="M249 223a31 31 0 0 1 48-40l-48 40Z" fill="#CC7358" />
      <path d="M249 223a31 31 0 0 0 48-40l-48 40Z" fill="#E68A68" />
      <path d="m257 215 30-25" stroke="#F4B19A" strokeWidth="3" />
    </>}
    {(isSoup ? [[160, 130], [203, 113], [252, 151], [174, 193], [222, 213], [265, 204], [214, 162]]
      : [[162, 97], [187, 107], [277, 125], [302, 141], [139, 224], [238, 249], [279, 234]])
      .map(([x, y], index) => <ellipse key={index} cx={x} cy={y} rx="9" ry="7" transform={`rotate(${index * 23} ${x} ${y})`} fill={isSoup ? "#F0C37C" : "#F4E5B9"} stroke="#D2B578" strokeWidth="1.5" />)}
    {isSoup && <>
      <path d="M190 153c-17-29-43-19-38-3 5 17 24 16 38 3Zm1 0c3-33 30-37 36-19 6 18-14 23-36 19Z" fill="#5D7848" />
      <path d="m188 157 10 22" stroke="#526B40" strokeWidth="3" strokeLinecap="round" />
    </>}
    <path d="m84 267 33 21a31 31 0 0 0 4-49l-37 28Z" fill="#EBC76D" />
    <path d="m91 266 25 15a23 23 0 0 0 3-34l-28 19Z" fill="#F8E7A8" />
    <path d="m100 266 16 6m-8-10 9-7" stroke="#DCC371" strokeWidth="2" />
    <circle cx="337" cy="280" r="4" fill="#567B44" /><circle cx="351" cy="272" r="3" fill="#78916A" />
  </svg>;
}
