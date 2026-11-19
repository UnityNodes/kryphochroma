"use client";

import { Check } from "lucide-react";
import type { TableViewMode } from "@/game/tableView";
import { cn } from "@/lib/utils";

interface ViewOption {
  readonly mode: TableViewMode;
  readonly title: string;
  readonly text: string;
  readonly image: string;
}

const OPTIONS: readonly ViewOption[] = [
  { mode: "2d", title: "2D table", text: "Flat and quick. Works on any phone.", image: "/landing/view-2d.webp" },
  { mode: "3d", title: "3D table", text: "A real card table with chairs. Best on a laptop or a recent phone.", image: "/landing/view-3d.webp" },
];

export function ViewPicker({ view, onChoose, compact = false }: { readonly view: TableViewMode; readonly onChoose: (mode: TableViewMode) => void; readonly compact?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4" role="radiogroup" aria-label="How the table looks">
      {OPTIONS.map((option) => {
        const on = view === option.mode;
        return (
          <button key={option.mode} type="button" role="radio" aria-checked={on} onClick={() => onChoose(option.mode)} className={cn("kc-view-pick", compact && "kc-view-pick-compact")}>
            <span className="kc-view-pick-shot">
              <img src={option.image} alt="" width={800} height={500} loading="lazy" decoding="async" />
              {on && (
                <span className="kc-view-pick-badge">
                  <Check aria-hidden />
                  Chosen
                </span>
              )}
            </span>
            <span className="grid gap-1 px-1 text-left">
              <b className="font-display text-2xl leading-none font-normal sm:text-3xl">{option.title}</b>
              {!compact && <small className="text-sm leading-snug text-cream/70">{option.text}</small>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
