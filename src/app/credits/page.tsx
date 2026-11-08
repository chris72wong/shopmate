import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { SectionHeading } from "@/components/planner-ui";

export const metadata: Metadata = { title: "Photo credits" };

const photos = [
  { file: "vegetables", author: "Nadine Primeau", source: "https://unsplash.com/photos/wpoKpJqOsKE", license: "Unsplash License" },
  { file: "salad", author: "Anna Pelzer", source: "https://unsplash.com/photos/IGfIGP5ONV0", license: "Unsplash License" },
  { file: "soup", author: "Ella Olsson", source: "https://unsplash.com/photos/fxJTl_gDh28", license: "Unsplash License" },
  { file: "oats", author: "Brooke Lark", source: "https://unsplash.com/photos/W9OKrxBqiZA", license: "Unsplash License" },
  { file: "pasta", author: "Eaters Collective", source: "https://commons.wikimedia.org/wiki/File:Plate_of_Pasta_(Unsplash).jpg", license: "CC0 1.0" },
];

export default function CreditsPage() {
  return <div className="credits-page app-width">
    <SectionHeading title="Photo credits" />
    <p>Real photography, used under the <a className="text-link" href="https://unsplash.com/license">Unsplash License</a> or <a className="text-link" href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>.</p>
    <ul className="credits-list">{photos.map(photo => <li key={photo.file}>
      <Image src={`/photos/${photo.file}.jpg`} alt="" width={128} height={128} sizes="64px" />
      <a href={photo.source} target="_blank" rel="noreferrer">{photo.author}<span>{photo.license}</span></a>
    </li>)}</ul>
    <p>Meal photographs are serving inspiration, not exact recipe contents.</p>
    <Link className="text-button" href="/">Back to ShopMate</Link>
  </div>;
}
