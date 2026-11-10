import { cardOf, fullDeck } from "@kryphochroma/rules";
import { describe, expect, it } from "vitest";
import { CLIP_ID, RING_ID, cardBack, cardFace, colorShape, ringLabel, sharedDefs } from "../src/index.js";

const isWellFormed = (svg: string): boolean =>
  svg.startsWith("<svg") && svg.endsWith("</svg>") && (svg.match(/<svg/g) ?? []).length === 1;

describe("card faces", () => {
  it("renders every one of the 54 card types as one svg", () => {
    for (const card of new Set(fullDeck())) {
      const svg = cardFace(card);
      expect(isWellFormed(svg)).toBe(true);
      expect(svg).toContain(`url(#${CLIP_ID})`);
      expect(svg).not.toMatch(/NaN|undefined/);
    }
  });

  it("uses the card colour and shows digits, +2 and +4 as text", () => {
    expect(cardFace(cardOf(2, 7))).toContain("#1f9e8a");
    expect(cardFace(cardOf(2, 7))).toContain(">7</text>");
    expect(cardFace(cardOf(0, 12))).toContain(">+2</text>");
    expect(cardFace(cardOf(4, 14))).toContain(">+4</text>");
    expect(cardFace(cardOf(4, 13))).not.toContain("</text>");
  });

  it("adds a colour shape only in colour blind mode", () => {
    const plain = cardFace(cardOf(3, 5));
    const marked = cardFace(cardOf(3, 5), { colorBlind: true });
    expect(marked.length).toBeGreaterThan(plain.length);
    expect(cardFace(cardOf(4, 13), { colorBlind: true })).toBe(cardFace(cardOf(4, 13)));
    expect(colorShape(0, 0, 0, 4)).toContain("<circle");
    expect(colorShape(1, 0, 0, 4)).toContain("<path");
    expect(colorShape(2, 0, 0, 4)).toContain("<path");
    expect(colorShape(3, 0, 0, 4)).toContain("<rect");
    expect(colorShape(9, 0, 0, 4)).toBe("");
  });
});

describe("card back", () => {
  it("prints the handle in the sealed ring", () => {
    expect(ringLabel("0xabcdef0123456789")).toBe("EUINT8 · 0XABCDEF · SEALED · ACL · 0X6789 ·");
    expect(ringLabel("")).toBe("EUINT8 · 0X000000 · SEALED · ACL · 0X0000 ·");
    const svg = cardBack("0xabcdef0123456789");
    expect(isWellFormed(svg)).toBe(true);
    expect(svg).toContain(`href="#${RING_ID}"`);
    expect(cardBack()).toContain("0X000000");
  });

  it("ships the shared defs once", () => {
    expect(sharedDefs()).toContain(`id="${CLIP_ID}"`);
    expect(sharedDefs()).toContain(`id="${RING_ID}"`);
  });
});
