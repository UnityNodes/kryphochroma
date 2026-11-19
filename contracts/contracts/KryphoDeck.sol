// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint8, euint32} from "@fhevm/solidity/lib/FHE.sol";
import {IKryphoTable} from "./interfaces/IKryphoTable.sol";

library KryphoDeck {
    uint8 internal constant DECK_SIZE = 138;
    uint8 internal constant PER_COLOR = 26;
    uint8 internal constant WILDS_AT = 130;
    uint8 internal constant FILL_CHUNK = 12;
    uint8 internal constant FILL_STEPS = (DECK_SIZE + FILL_CHUNK - 1) / FILL_CHUNK;
    uint8 internal constant REFILL_AT = 48;
    uint8 internal constant REFILL_MAX = 60;

    function cardAt(uint8 index) internal pure returns (uint8) {
        if (index >= WILDS_AT) {
            uint8 k = index - WILDS_AT;
            return k % 2 == 0 ? 0x5D : 0x5E;
        }
        uint8 color = index / PER_COLOR;
        uint8 offset = index % PER_COLOR;
        if (offset == 0) return color * 16;
        if (offset == PER_COLOR - 1) return color * 16 + 13;
        return color * 16 + (offset + 1) / 2;
    }

    /** The same layout as cardAt, worked out on a ciphertext: offset 0 gives 0, offset 25 gives 13 and every pair in between one rank, so (offset + 1) >> 1 covers a colour without a branch. The offset comes from a multiply and a subtract, about half the cost of a remainder. */
    function cardOf(euint8 index) internal returns (euint8) {
        euint8 color = FHE.div(index, PER_COLOR);
        euint8 offset = FHE.sub(index, FHE.mul(color, PER_COLOR));
        euint8 colored = FHE.add(FHE.shl(color, 4), FHE.shr(FHE.add(offset, 1), 1));
        euint8 wild = FHE.add(FHE.and(offset, 1), 0x5D);
        return FHE.select(FHE.ge(index, WILDS_AT), wild, colored);
    }

    /** Nothing is shuffled: every card is drawn on its own from the make up of a full deck. A shuffle network stored thousands of intermediate ciphertexts per deck on the shared coprocessor; this stores one per card. A 16 bit draw scaled by 138 and shifted down picks the index within 0.2 percent of uniform, and skips the costly remainder. */
    function randomCard() internal returns (euint8) {
        euint32 scaled = FHE.mul(FHE.asEuint32(FHE.randEuint16()), uint32(DECK_SIZE));
        return cardOf(FHE.asEuint8(FHE.shr(scaled, 16)));
    }

    function fillSteps(uint8 size) internal pure returns (uint8) {
        return (size + FILL_CHUNK - 1) / FILL_CHUNK;
    }

    function fillStep(mapping(uint256 => euint8[138]) storage decks, uint256 id, uint8 step, uint8 at, uint8 size) public {
        uint8 start = step * FILL_CHUNK;
        uint8 end = start + FILL_CHUNK > size ? size : start + FILL_CHUNK;
        for (uint8 i = start; i < end; i++) {
            euint8 card = randomCard();
            decks[id][at + i] = card;
            FHE.allowThis(card);
        }
    }

    /** A running deck is topped up with freshly drawn cards, never with the discard pile: cards are independent draws, so nothing has to be shuffled and no played card comes back in a known order. */
    function refill(mapping(uint256 => euint8[138]) storage decks, IKryphoTable.Table storage t, uint256 id) public {
        uint8 size = t.refillSize;
        if (size == 0) {
            bool front = t.deckPtr >= DECK_SIZE - t.deckEnd;
            uint8 room = front ? t.deckPtr : DECK_SIZE - t.deckEnd;
            size = room < REFILL_MAX ? room : REFILL_MAX;
            if (size == 0 || t.deckEnd - t.deckPtr > REFILL_AT) revert IKryphoTable.ShuffleNotDone();
            t.refillSize = size;
            t.refillAt = front ? 0 : t.deckEnd;
        }
        uint8 step = t.refillStep;
        uint8 fills = fillSteps(size);
        if (step >= fills) revert IKryphoTable.ShuffleNotDone();
        fillStep(decks, id, step, t.refillAt, size);
        t.refillStep = step + 1;
        emit IKryphoTable.ShuffleProgress(id, step + 1, fills);
    }
}
