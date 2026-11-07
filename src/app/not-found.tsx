import Link from "next/link";

export default function NotFound() {
  return <div className="page-width empty-state"><span className="eyebrow">A SMALL DETOUR</span><h1>This shelf is empty.</h1><p>Let’s find our way back to something good.</p><Link href="/" className="button button-primary">Back to ShopMate <span aria-hidden="true">↗</span></Link></div>;
}
