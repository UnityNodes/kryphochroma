// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8} from "@fhevm/solidity/lib/FHE.sol";

library KryphoDeck {
    uint8 internal constant DECK_SIZE = 138;
    uint8 internal constant PER_COLOR = 26;
    uint8 internal constant WILDS_AT = 130;
    uint8 internal constant LAYERS_PER_PASS = 8;
    uint16 internal constant SHUFFLE_LAYERS = 32;
    uint16 internal constant SHUFFLE_STEPS = SHUFFLE_LAYERS * 2;
    uint8 internal constant FILL_CHUNK = 23;
    uint8 internal constant FILL_STEPS = DECK_SIZE / FILL_CHUNK;

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

    function fillStep(mapping(uint256 => euint8[138]) storage decks, uint256 id, uint8 step) public {
        euint8[138] storage deck = decks[id];
        uint8 start = step * FILL_CHUNK;
        for (uint8 i = start; i < start + FILL_CHUNK; i++) {
            euint8 card = FHE.asEuint8(cardAt(i));
            deck[i] = card;
            FHE.allowThis(card);
        }
    }

    function pairsIn(uint8 distance, uint8 size) internal pure returns (uint8 count) {
        for (uint8 i = 0; i < size; i++) {
            if (i & distance == 0 && (i | distance) < size) count++;
        }
    }

    function fillSteps(uint8 size) internal pure returns (uint8) {
        return (size + FILL_CHUNK - 1) / FILL_CHUNK;
    }

    function shuffleStep(mapping(uint256 => euint8[138]) storage decks, uint256 id, uint16 step, uint8 offset, uint8 size) public {
        euint8[138] storage deck = decks[id];
        uint8 distance = uint8(1) << uint8((step / 2) % LAYERS_PER_PASS);
        uint8 half = (pairsIn(distance, size) + 1) / 2;
        uint8 first = step % 2 == 0 ? 0 : half;
        uint8 last = step % 2 == 0 ? half : type(uint8).max;
        uint8 pair = 0;
        for (uint8 i = 0; i < size; i++) {
            uint8 j = i | distance;
            if (i & distance != 0 || j >= size) continue;
            uint8 current = pair++;
            if (current < first || current >= last) continue;
            ebool swap = FHE.randEbool();
            euint8 a = FHE.select(swap, deck[offset + j], deck[offset + i]);
            euint8 b = FHE.select(swap, deck[offset + i], deck[offset + j]);
            deck[offset + i] = a;
            deck[offset + j] = b;
            FHE.allowThis(a);
            FHE.allowThis(b);
        }
    }

    function refillStep(
        mapping(uint256 => euint8[138]) storage decks,
        mapping(uint256 => uint8[]) storage discards,
        uint256 id,
        uint8 step,
        uint16 from,
        uint8 at,
        uint8 size
    ) public {
        uint8 end = (step + 1) * FILL_CHUNK;
        for (uint8 i = step * FILL_CHUNK; i < end && i < size; i++) {
            euint8 card = FHE.asEuint8(discards[id][from + i]);
            decks[id][at + i] = card;
            FHE.allowThis(card);
        }
    }
}
