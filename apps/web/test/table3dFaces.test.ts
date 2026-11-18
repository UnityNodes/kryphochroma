import { existsSync } from "node:fs";
import { join } from "node:path";
import { RANK, WILD_COLOR, cardOf, fullDeck, isWild } from "@kryphochroma/rules";
import { describe, expect, it } from "vitest";
import { BACK_URL, faceName, faceUrl } from "@/components/table3d/faces";

const PUBLIC_DIR = join(__dirname, "..", "public");

describe("card face images", () => {
  it("names a face by colour and rank", () => {
    expect(faceName(cardOf(2, 7))).toBe("teal-7");
    expect(faceName(cardOf(0, RANK.drawTwo))).toBe("red-draw2");
    expect(faceName(cardOf(4, RANK.spyglass))).toBe("violet-spyglass");
    expect(faceName(cardOf(WILD_COLOR, RANK.wild))).toBe("wild");
    expect(faceName(cardOf(WILD_COLOR, RANK.wildDrawFour))).toBe("wild-draw4");
  });

  it("keeps the shape variant only for cards that carry a colour", () => {
    expect(faceUrl(cardOf(1, 4), true)).toBe("/cards/shapes/sun-4.webp");
    expect(faceUrl(cardOf(1, 4), false)).toBe("/cards/sun-4.webp");
    expect(faceUrl(cardOf(WILD_COLOR, RANK.wild), true)).toBe("/cards/wild.webp");
  });

  it("has a rendered image for the back and for every card of the deck in both variants", () => {
    expect(existsSync(join(PUBLIC_DIR, BACK_URL))).toBe(true);
    const cards = [...new Set(fullDeck())];
    expect(cards).toHaveLength(72);
    for (const card of cards) {
      expect(existsSync(join(PUBLIC_DIR, faceUrl(card, false))), faceName(card)).toBe(true);
      expect(existsSync(join(PUBLIC_DIR, faceUrl(card, true))), `shapes ${faceName(card)}`).toBe(true);
      expect(faceUrl(card, true) === faceUrl(card, false)).toBe(isWild(card));
    }
  });
});
