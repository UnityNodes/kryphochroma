"use client";

import { useTableView } from "@/game/useTableView";

const MODES = [
  { mode: "2d", label: "2D" },
  { mode: "3d", label: "3D" },
] as const;

export function HeroView() {
  const { view, choose } = useTableView();
  return (
    <div className="br-view" data-in>
      <span id="br-view-label">Table view</span>
      <div role="radiogroup" aria-labelledby="br-view-label">
        {MODES.map(({ mode, label }) => (
          <button key={mode} type="button" role="radio" aria-checked={view === mode} onClick={() => choose(mode)}>
            {label}
          </button>
        ))}
      </div>
      <small>{view === "3d" ? "A real card table with chairs" : "Flat and quick on any phone"}</small>
    </div>
  );
}
