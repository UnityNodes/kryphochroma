// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8} from "@fhevm/solidity/lib/FHE.sol";

library KryphoDeck {
    uint8 internal constant DECK_SIZE = 108;
    uint8 internal constant LAYERS_PER_PASS = 7;
    uint16 internal constant SHUFFLE_LAYERS = 28;

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

    function fill(euint8[108] storage deck) internal {
        for (uint8 i = 0; i < DECK_SIZE; i++) {
            euint8 card = FHE.asEuint8(cardAt(i));
            deck[i] = card;
            FHE.allowThis(card);
        }
    }

    function shuffleLayer(euint8[108] storage deck, uint16 layer) internal {
        uint8 distance = uint8(1) << uint8(layer % LAYERS_PER_PASS);
        for (uint8 i = 0; i < DECK_SIZE; i++) {
            uint8 j = i | distance;
            if (i & distance != 0 || j >= DECK_SIZE) continue;
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
