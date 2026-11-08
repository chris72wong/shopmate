import type { ReactNode } from "react";
import { MealArt } from "@/components/grocery-art";

export function SectionHeading({ title, children }: { title: string; children?: ReactNode }) {
  return <header className="screen-heading"><h1 tabIndex={-1} id="screen-title">{title}</h1>{children && <p>{children}</p>}</header>;
}

export function Notices({ items }: { items: string[] }) {
  return items.length ? <details className="disclosure notices"><summary>Details</summary><div>{items.map((item, index) => <p key={index}>{item}</p>)}</div></details> : null;
}

export function LoadingState({ label }: { label: string }) {
  return <div className="loading-state" role="status" aria-label={label}><MealArt kind="soup" /><span className="spinner" /><span className="sr-only">{label}</span></div>;
}
