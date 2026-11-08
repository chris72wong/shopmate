import Link from "next/link";
import { GroceryTote } from "@/components/grocery-art";

export default function NotFound() {
  return <div className="not-found page-width"><GroceryTote /><h1>Page not found</h1><Link href="/" className="button button-primary">Back to ShopMate</Link></div>;
}
