"use client";

import { useSyncExternalStore } from "react";

const LANDED_HOLD_MS = 8000;
const seats = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** The lobby shows the seat as taken while its join is still being mined, and keeps it shown a little after the receipt so a lagging read does not flash the Take a seat button back. */
export function trackSeat(id: string, task: Promise<void>): Promise<void> {
  seats.set(id, task);
  emit();
  const clear = () => {
    if (seats.get(id) !== task) return;
    seats.delete(id);
    emit();
  };
  task.then(() => setTimeout(clear, LANDED_HOLD_MS), clear);
  return task;
}

export const isSeatInFlight = (id: string): boolean => seats.has(id);

export function useSeatInFlight(id: string): boolean {
  return useSyncExternalStore(subscribe, () => isSeatInFlight(id), () => false);
}
