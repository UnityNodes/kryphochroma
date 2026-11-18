"use client";

import { useEffect, useMemo, useRef } from "react";
import type { PlayingTransition } from "@/game/useTransitionQueue";
import type { TableModel } from "./model";
import type { TableHandle } from "./mount";

export interface Table3dSurfaceProps {
  readonly model: TableModel;
  readonly playing: PlayingTransition | null;
  readonly shapes: boolean;
  readonly me: number;
  readonly onUnavailable: () => void;
}

/** The scene and three.js are fetched only when this component is on the page, so a table in the 2D view never pays for them. */
export function Table3dSurface({ model, playing, shapes, me, onUnavailable }: Table3dSurfaceProps) {
  const host = useRef<HTMLDivElement>(null);
  const seal = useRef<HTMLDivElement>(null);
  const handle = useRef<TableHandle | null>(null);
  const input = useMemo(() => ({ model, playing, shapes, me }), [model, playing, shapes, me]);
  const latest = useRef(input);
  const unavailable = useRef(onUnavailable);
  useEffect(() => {
    latest.current = input;
    unavailable.current = onUnavailable;
  });

  useEffect(() => {
    const stage = host.current;
    const sealEl = seal.current;
    const root = stage?.closest<HTMLElement>(".kc-table");
    if (!stage || !sealEl || !root) return;
    let cancelled = false;
    import("./mount")
      .then(({ mountTable3d }) => {
        if (cancelled) return;
        const mounted = mountTable3d({ root, host: stage, seal: sealEl, reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches, input: latest.current, onLost: () => unavailable.current() });
        if (mounted) handle.current = mounted;
        else unavailable.current();
      })
      .catch((error: unknown) => {
        console.error(error);
        if (!cancelled) unavailable.current();
      });
    return () => {
      cancelled = true;
      handle.current?.unmount();
      handle.current = null;
    };
  }, []);

  useEffect(() => {
    handle.current?.update(input);
  }, [input]);

  return (
    <>
      <div ref={host} className="kc-3d-stage" />
      <div ref={seal} className="kc-3d-seal" hidden aria-hidden>
        <span>
          Decrypting
          <i />
        </span>
      </div>
    </>
  );
}
