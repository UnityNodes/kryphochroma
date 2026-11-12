"use client";

import { useEffect, useState } from "react";

const BURST_MS = 1900;

export function MonoBurst({ actor, stamp }: { readonly actor: string | null; readonly stamp: number }) {
  const [shown, setShown] = useState<{ readonly actor: string; readonly stamp: number } | null>(null);

  useEffect(() => {
    if (!actor) return;
    setShown({ actor, stamp });
    const timer = setTimeout(() => setShown(null), BURST_MS);
    return () => clearTimeout(timer);
  }, [actor, stamp]);

  if (!shown) return null;
  return (
    <div key={shown.stamp} className="kc-mono-burst pointer-events-none absolute inset-0 z-40 grid place-items-center" aria-hidden>
      <div className="grid justify-items-center gap-1">
        <span className="font-display text-[clamp(64px,14vw,168px)] leading-none text-sun [text-shadow:4px_4px_0_var(--color-red),9px_9px_0_var(--color-ink)]">MONO!</span>
        <span className="rounded-full bg-ink/85 px-4 py-1 text-lg font-semibold text-cream">{shown.actor === "You" ? "You called it" : `${shown.actor} called it`}</span>
      </div>
    </div>
  );
}
