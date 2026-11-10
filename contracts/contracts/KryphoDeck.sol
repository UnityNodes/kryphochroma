// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8} from "@fhevm/solidity/lib/FHE.sol";

library KryphoDeck {
    uint8 internal constant DECK_SIZE = 108;
    uint8 internal constant LAYERS_PER_PASS = 7;
    uint16 internal constant SHUFFLE_LAYERS = 28;
    uint16 internal constant SHUFFLE_STEPS = SHUFFLE_LAYERS * 2;
    uint8 internal constant FILL_CHUNK = 27;
    uint8 internal constant FILL_STEPS = DECK_SIZE / FILL_CHUNK;

    function cardAt(uint8 index) internal pure returns (uint8) {
        if (index >= 100) {
            uint8 k = index - 100;
            return k % 2 == 0 ? 0x4D : 0x4E;
        }
        uint8 color = index / 25;
        uint8 offset = index % 25;
        if (offset == 0) return color * 16;
        return color * 16 + (offset + 1) / 2;
    }

    function fillStep(euint8[108] storage deck, uint8 step) internal {
        uint8 start = step * FILL_CHUNK;
        for (uint8 i = start; i < start + FILL_CHUNK; i++) {
            euint8 card = FHE.asEuint8(cardAt(i));
            deck[i] = card;
            FHE.allowThis(card);
        }
    }

    function pairsIn(uint8 distance) internal pure returns (uint8 count) {
        for (uint8 i = 0; i < DECK_SIZE; i++) {
            if (i & distance == 0 && (i | distance) < DECK_SIZE) count++;
        }
    }

    function shuffleStep(euint8[108] storage deck, uint16 step) internal {
        uint8 distance = uint8(1) << uint8((step / 2) % LAYERS_PER_PASS);
        uint8 half = (pairsIn(distance) + 1) / 2;
        uint8 first = step % 2 == 0 ? 0 : half;
        uint8 last = step % 2 == 0 ? half : type(uint8).max;
        uint8 pair = 0;
        for (uint8 i = 0; i < DECK_SIZE; i++) {
            uint8 j = i | distance;
            if (i & distance != 0 || j >= DECK_SIZE) continue;
            uint8 current = pair++;
            if (current < first || current >= last) continue;
            ebool swap = FHE.randEbool();
            euint8 a = FHE.select(swap, deck[j], deck[i]);
            euint8 b = FHE.select(swap, deck[i], deck[j]);
            deck[i] = a;
            deck[j] = b;
            FHE.allowThis(a);
            FHE.allowThis(b);
        }
    }
}
