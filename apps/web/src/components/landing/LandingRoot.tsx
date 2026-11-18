"use client";

import { type ReactNode, useEffect, useRef } from "react";

export function LandingRoot({ children }: { readonly children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let cancelled = false;
    let unmount: (() => void) | undefined;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    import("./mount")
      .then(({ mountLanding }) => {
        if (!cancelled) unmount = mountLanding(root, { reducedMotion });
      })
      .catch((error: unknown) => {
        console.error(error);
        root.classList.add("is-live", "no-gl", "is-still");
      });
    return () => {
      cancelled = true;
      unmount?.();
    };
  }, []);

  return (
    <div ref={ref} className="kc-landing">
      {children}
    </div>
  );
}
