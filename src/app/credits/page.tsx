import { redirect } from "next/navigation";

// Keep old bookmarks useful after replacing every stock photo with original artwork.
export default function CreditsPage() {
  redirect("/");
}
