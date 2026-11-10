import { describe, expect, it } from "vitest";
import {
  DECK_SIZE,
  cardLabel,
  cardOf,
  colorOf,
  fullDeck,
  isAction,
  isColor,
  isDrawFour,
  isNumber,
  isValidCard,
  isWild,
  matches,
  points,
  rankOf,
} from "../src/index.js";
import { B, G, R, WILD, WILD4, Y } from "./helpers.js";

describe("cards", () => {
  it("encodes color and rank into one byte", () => {
    expect(cardOf(2, 7)).toBe(39);
    expect(colorOf(39)).toBe(2);
    expect(rankOf(39)).toBe(7);
  });

  it("builds a 108 card deck with the classic composition", () => {
    const deck = fullDeck();
    expect(deck).toHaveLength(DECK_SIZE);
    expect(deck.filter((c) => c === R(0))).toHaveLength(1);
    expect(deck.filter((c) => c === Y(9))).toHaveLength(2);
    expect(deck.filter((c) => c === B(12))).toHaveLength(2);
    expect(deck.filter((c) => c === WILD)).toHaveLength(4);
    expect(deck.filter((c) => c === WILD4)).toHaveLength(4);
    expect(new Set(deck).size).toBe(54);
    expect(deck.every(isValidCard)).toBe(true);
  });

  it("rejects ids outside the 54 types", () => {
    expect(isValidCard(cardOf(0, 13))).toBe(false);
    expect(isValidCard(cardOf(4, 0))).toBe(false);
    expect(isValidCard(cardOf(5, 1))).toBe(false);
    expect(isValidCard(-1)).toBe(false);
    expect(isValidCard(1.5)).toBe(false);
    expect(isValidCard(256)).toBe(false);
  });

  it("classifies cards", () => {
    expect(isWild(WILD)).toBe(true);
    expect(isDrawFour(WILD4)).toBe(true);
    expect(isDrawFour(WILD)).toBe(false);
    expect(isNumber(G(9))).toBe(true);
    expect(isNumber(G(10))).toBe(false);
    expect(isNumber(WILD)).toBe(false);
    expect(isAction(R(12))).toBe(true);
    expect(isAction(WILD4)).toBe(false);
    expect(isColor(3)).toBe(true);
    expect(isColor(4)).toBe(false);
    expect(isColor(0.5)).toBe(false);
  });

  it("scores numbers by face value, actions 20, wilds 50", () => {
    expect(points(R(7))).toBe(7);
    expect(points(Y(10))).toBe(20);
    expect(points(B(12))).toBe(20);
    expect(points(WILD)).toBe(50);
    expect(points(WILD4)).toBe(50);
  });

  it("matches by current color or rank, wilds always", () => {
    expect(matches(R(3), G(5), 0)).toBe(true);
    expect(matches(Y(5), G(5), 2)).toBe(true);
    expect(matches(Y(6), G(5), 2)).toBe(false);
    expect(matches(WILD4, G(5), 2)).toBe(true);
    expect(matches(B(1), WILD, 3)).toBe(true);
    expect(matches(B(1), WILD, 0)).toBe(false);
  });

  it("labels cards for screen readers", () => {
    expect(cardLabel(G(7))).toBe("Teal 7");
    expect(cardLabel(R(10))).toBe("Red skip");
    expect(cardLabel(Y(11))).toBe("Sun reverse");
    expect(cardLabel(B(12))).toBe("Blue draw two");
    expect(cardLabel(WILD)).toBe("Wild");
    expect(cardLabel(WILD4)).toBe("Wild draw four");
    expect(cardLabel(cardOf(6, 1))).toBe("Unknown 1");
  });
});
