import type { ReactNode } from "react";
import { MealArt } from "@/components/grocery-art";

export function SectionHeading({ title, children }: { title: string; children?: ReactNode }) {
  return <header className="screen-heading"><h1 tabIndex={-1} id="screen-title">{title}</h1>{children && <p>{children}</p>}</header>;
}

export function Counter({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <div className="counter-row"><span>{label}</span><div className="counter"><button type="button" aria-label={`Decrease ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)}>−</button><output aria-label={label} aria-live="polite">{value}</output><button type="button" aria-label={`Increase ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button></div></div>;
}

export function Notices({ items }: { items: string[] }) {
  return items.length ? <details className="disclosure notices"><summary>Good to know</summary><div>{items.map((item, index) => <p key={index}>{item}</p>)}</div></details> : null;
}

export function LoadingState({ title, description }: { title: string; description: string }) {
  return <div className="loading-state" role="status"><MealArt kind="soup" /><div><strong><span className="spinner" />{title}</strong><p>{description}</p></div><div className="loading-skeleton" aria-hidden="true"><span /><span /><span /></div></div>;
}
