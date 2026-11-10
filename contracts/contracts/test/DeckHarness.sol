// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {euint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {KryphoDeck} from "../KryphoDeck.sol";

contract DeckHarness is ZamaEthereumConfig {
    euint8[108] internal _deck;

    function cardAt(uint8 index) external pure returns (uint8) {
        return KryphoDeck.cardAt(index);
    }

    function fill() external {
        for (uint8 step = 0; step < KryphoDeck.FILL_STEPS; step++) KryphoDeck.fillStep(_deck, step);
    }

    function shuffleStep(uint16 step) external {
        KryphoDeck.shuffleStep(_deck, step);
    }

    function pairsIn(uint8 distance) external pure returns (uint8) {
        return KryphoDeck.pairsIn(distance);
    }

    function deckAt(uint8 i) external view returns (euint8) {
        return _deck[i];
    }
}
