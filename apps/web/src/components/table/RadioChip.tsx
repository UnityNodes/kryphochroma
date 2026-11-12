"use client";

import { Pause, Play, Radio, SkipBack, SkipForward } from "lucide-react";
import { Popover } from "radix-ui";
import type { RadioControls } from "@/game/useRadio";
import { cn } from "@/lib/utils";

const ICON_BTN = "grid size-11 place-items-center rounded-full border-2 border-cream text-cream hover:bg-cream/10 focus-visible:outline-3 focus-visible:outline-sun";

export function RadioChip({ radio }: { readonly radio: RadioControls }) {
  const label = radio.on ? `Radio on, ${radio.station.name} ${radio.station.freq}` : "Radio off";
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className={cn("kc-chip", radio.on && "kc-chip-on")} aria-label={label}>
          {radio.on ? (
            <span className="kc-eq" aria-hidden>
              <span />
              <span />
              <span />
            </span>
          ) : (
            <Radio aria-hidden />
          )}
          <span className="kc-hide-s">{radio.on ? radio.station.freq : "Radio"}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={8} align="end" className="z-50 grid w-[min(300px,calc(100vw-32px))] gap-3 rounded-[22px] border-2 border-cream bg-ink p-4 text-left text-cream shadow-[6px_6px_0_var(--color-red)]">
          <div className="grid gap-0.5">
            <span className="text-xs font-semibold tracking-[.14em] text-muted uppercase">Kryphochroma FM</span>
            <b className="font-display text-2xl font-normal text-sun" aria-live="polite">
              {radio.station.freq} · {radio.station.name}
            </b>
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
          <label className="grid gap-1 text-sm">
            <span className="text-muted">Volume</span>
            <input type="range" min={0} max={1} step={0.05} value={radio.volume} onChange={(e) => radio.setVolume(Number(e.target.value))} className="accent-[var(--y)]" />
          </label>
          <p className="text-xs text-muted" role={radio.unavailable ? "status" : undefined}>
            {radio.unavailable ? "This browser blocked the audio engine, so the radio stays off. The game works as usual." : "Composed live in your browser. The beat speeds up when someone is down to one card."}
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
