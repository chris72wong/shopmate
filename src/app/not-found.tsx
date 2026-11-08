import Link from "next/link";
import { GroceryTote } from "@/components/grocery-art";

export default function NotFound() {
  return <div className="not-found page-width"><GroceryTote /><p className="eyebrow">A LITTLE OFF THE SHOPPING LIST</p><h1>This aisle is empty.</h1><p>We couldn’t find that page. Let’s get you back to something good.</p><Link href="/" className="button button-primary">Back to ShopMate</Link></div>;
}
