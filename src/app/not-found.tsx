import Link from "next/link";

export default function NotFound() {
  return <div className="page-width empty-state"><h1>Page not found</h1><Link href="/" className="button button-primary">Back to ShopMate</Link></div>;
}
