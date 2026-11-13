// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {KryphoDeck} from "../KryphoDeck.sol";

contract DeckHarness is ZamaEthereumConfig {
    mapping(uint256 => euint8[138]) internal _decks;
    euint8 public lastCard;

    function cardAt(uint8 index) external pure returns (uint8) {
        return KryphoDeck.cardAt(index);
    }

    function encode(uint16 index) external {
        lastCard = KryphoDeck.cardOf(FHE.asEuint8(uint8(index)));
        FHE.allowThis(lastCard);
    }

    function fill(uint8 step) external {
        KryphoDeck.fillStep(_decks, 0, step, 0, KryphoDeck.DECK_SIZE);
    }

    function fillSteps() external pure returns (uint8) {
        return KryphoDeck.FILL_STEPS;
    }

    function deckAt(uint8 i) external view returns (euint8) {
        return _decks[0][i];
    }
}
