import { COLOR } from "@kryphochroma/rules";

const LIGHT_GROUNDS: ReadonlySet<number> = new Set([COLOR.red, COLOR.sun, COLOR.teal]);
const TINT_SHARE = 62;

/**
 * Cream on red, sun and teal stays under the 3:1 contrast floor for display text, so those grounds take room ink instead.
 */
export function inkOn(color: number): string {
  return LIGHT_GROUNDS.has(color) ? "var(--color-bg)" : "var(--color-cream)";
}

/**
 * The card blues and violets are too dark to read as text on room ink, so text in a card colour is lifted toward cream.
 */
export function tint(base: string): string {
  return `color-mix(in srgb, ${base} ${TINT_SHARE}%, var(--color-cream))`;
}
