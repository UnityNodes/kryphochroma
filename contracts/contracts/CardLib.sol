// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

library CardLib {
    uint8 internal constant WILD_COLOR = 5;
    uint8 internal constant SKIP = 10;
    uint8 internal constant REVERSE = 11;
    uint8 internal constant DRAW_TWO = 12;
    uint8 internal constant SPYGLASS = 13;
    uint8 internal constant WILD = 0x5D;
    uint8 internal constant WILD_DRAW_FOUR = 0x5E;

    function colorOf(uint8 card) internal pure returns (uint8) {
        return card >> 4;
    }

    function rankOf(uint8 card) internal pure returns (uint8) {
        return card & 15;
    }

    function isWild(uint8 card) internal pure returns (bool) {
        return colorOf(card) == WILD_COLOR;
    }

    function isNumber(uint8 card) internal pure returns (bool) {
        return !isWild(card) && rankOf(card) <= 9;
    }

    function isSpyglass(uint8 card) internal pure returns (bool) {
        return !isWild(card) && rankOf(card) == SPYGLASS;
    }

    function isDrawTwo(uint8 card) internal pure returns (bool) {
        return !isWild(card) && rankOf(card) == DRAW_TWO;
    }

    function isValid(uint8 card) internal pure returns (bool) {
        if (isWild(card)) return card == WILD || card == WILD_DRAW_FOUR;
        return colorOf(card) < WILD_COLOR && rankOf(card) <= SPYGLASS;
    }

    function matches(uint8 card, uint8 topCard, uint8 color) internal pure returns (bool) {
        if (isWild(card)) return true;
        return colorOf(card) == color || rankOf(card) == rankOf(topCard);
    }

    function points(uint8 card) internal pure returns (uint16) {
        if (isWild(card)) return 50;
        if (rankOf(card) >= SKIP) return 20;
        return rankOf(card);
    }
}
