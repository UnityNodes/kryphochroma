import { STATIONS } from "./radio";

export interface RadioSettings {
  readonly on: boolean;
  readonly station: number;
  readonly volume: number;
}

export const DEFAULT_RADIO: RadioSettings = { on: false, station: 0, volume: 0.5 };
const RADIO_KEY = "kc-radio";

export function loadRadio(storage: Pick<Storage, "getItem"> | null): RadioSettings {
  try {
    const raw = JSON.parse(storage?.getItem(RADIO_KEY) ?? "null") as Partial<RadioSettings> | null;
    if (!raw || typeof raw !== "object") return DEFAULT_RADIO;
    const station = Number.isInteger(raw.station) && (raw.station as number) >= 0 && (raw.station as number) < STATIONS.length ? (raw.station as number) : 0;
    const volume = typeof raw.volume === "number" && Number.isFinite(raw.volume) ? Math.min(1, Math.max(0, raw.volume)) : DEFAULT_RADIO.volume;
    return { on: raw.on === true, station, volume };
  } catch {
    return DEFAULT_RADIO;
  }
}

export function saveRadio(storage: Pick<Storage, "setItem"> | null, settings: RadioSettings): void {
  try {
    storage?.setItem(RADIO_KEY, JSON.stringify(settings));
  } catch {
    return;
  }
}
