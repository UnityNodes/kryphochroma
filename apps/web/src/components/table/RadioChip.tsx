"use client";

import { ArrowUpRight, Pause, Play, Radio, SkipBack, SkipForward } from "lucide-react";
import { Popover } from "radix-ui";
import { STATIONS } from "@/game/stations";
import type { RadioControls, RadioStatus } from "@/game/useRadio";
import { cn } from "@/lib/utils";

const ICON_BTN = "grid size-11 place-items-center rounded-full border-2 border-cream text-cream hover:bg-cream/10 focus-visible:outline-3 focus-visible:outline-sun";

const STATUS_TEXT: Record<RadioStatus, string> = {
  idle: "Off air",
  loading: "Tuning in…",
  live: "On air",
  error: "Station unavailable, try another",
};

export function RadioChip({ radio }: { readonly radio: RadioControls }) {
  const live = radio.status === "live";
  const label = radio.on ? `Radio on, ${radio.station.name}` : "Radio off";
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className={cn("kc-chip", radio.on && "kc-chip-on")} aria-label={label}>
          {live ? (
            <span className="kc-eq" aria-hidden>
              <span />
              <span />
              <span />
            </span>
          ) : (
            <Radio aria-hidden />
          )}
          <span className="kc-hide-s">{radio.on ? radio.station.name : "Radio"}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={8} align="end" className="z-50 grid w-[min(320px,calc(100vw-32px))] gap-3 rounded-[22px] border-2 border-cream bg-ink p-4 text-left text-cream shadow-[6px_6px_0_var(--color-red)]">
          <div className="grid gap-0.5">
            <b className="font-display text-2xl leading-none font-normal text-sun">{radio.station.name}</b>
            <span className="text-sm text-muted" role="status">
              {radio.station.genre} · {STATUS_TEXT[radio.status]}
            </span>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button type="button" className={ICON_BTN} aria-label="Previous station" onClick={() => radio.tune(-1)}>
              <SkipBack className="size-5" aria-hidden />
            </button>
            <button type="button" className={cn(ICON_BTN, "size-14 bg-sun text-ink hover:bg-sun")} aria-label={radio.on ? "Turn the radio off" : "Turn the radio on"} aria-pressed={radio.on} onClick={radio.toggle}>
              {radio.on ? <Pause className="size-6" aria-hidden /> : <Play className="size-6" aria-hidden />}
            </button>
            <button type="button" className={ICON_BTN} aria-label="Next station" onClick={() => radio.tune(1)}>
              <SkipForward className="size-5" aria-hidden />
            </button>
          </div>
          <ul className="-mx-1 grid max-h-[min(286px,38dvh)] overflow-y-auto overscroll-contain" aria-label="Stations">
            {STATIONS.map((station, i) => {
              const current = i === radio.index;
              return (
                <li key={station.id}>
                  <button
                    type="button"
                    className={cn("flex min-h-11 w-full items-baseline justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-cream/10 focus-visible:outline-3 focus-visible:outline-sun", current && "bg-cream/10")}
                    aria-pressed={current && radio.on}
                    onClick={() => radio.pick(i)}
                  >
                    <span className={cn("min-w-0 truncate font-semibold", current && "text-sun")}>{station.name}</span>
                    <span className="shrink-0 text-xs text-muted">{station.genre}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Volume</span>
            <input id="kc-radio-volume" type="range" min={0} max={1} step={0.05} value={radio.volume} onChange={(e) => radio.setVolume(Number(e.target.value))} className="accent-[var(--y)]" />
          </label>
          <p className="text-xs text-muted">
            {radio.station.license}, streamed straight from{" "}
            <a href={radio.station.site} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-cream underline underline-offset-2">
              the station
              <ArrowUpRight className="size-3" aria-hidden />
            </a>
            . Nothing plays until you press play.
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
