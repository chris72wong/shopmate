"use client";

import { useState } from "react";
import { GroceryTote } from "@/components/grocery-art";

export function AnimatedGroceries() {
  const [paused, setPaused] = useState(false);
  return <div className={`market-scene ${paused ? "is-paused" : ""}`}>
    <GroceryTote />
    <button className="motion-toggle" type="button" aria-label={paused ? "Play grocery animation" : "Pause grocery animation"} aria-pressed={paused} onClick={() => setPaused(previous => !previous)}>
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{paused ? <path d="m9 5 11 7-11 7V5Z" /> : <path d="M7 5h3v14H7zm7 0h3v14h-3z" />}</svg>
    </button>
  </div>;
}
