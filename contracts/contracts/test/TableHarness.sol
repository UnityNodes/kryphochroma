// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, euint8} from "@fhevm/solidity/lib/FHE.sol";
import {KryphoTable} from "../KryphoTable.sol";

contract TableHarness is KryphoTable {
    constructor(address takeover) KryphoTable(takeover) {}

    function stageDeck(uint256 id, uint8 deckPtr, uint8[] calldata below) external {
        uint8[] storage pile = _discard[id];
        uint8 top = pile[pile.length - 1];
        delete _discard[id];
        for (uint256 i = 0; i < below.length; i++) pile.push(below[i]);
        pile.push(top);
        _tables[id].deckPtr = deckPtr;
    }

    function deckCardAt(uint256 id, uint8 index) external view returns (euint8) {
        return _deck[id][index];
    }

    function setHandCard(uint256 id, uint8 seat, uint8 slot, uint8 card) external {
        euint8 value = FHE.asEuint8(card);
        _hands[id][seat][slot] = value;
        FHE.allowThis(value);
        FHE.allow(value, _seats[id][seat].session);
        _handColors[id][seat][slot] = FHE.shr(value, 4);
        FHE.allowThis(_handColors[id][seat][slot]);
    }

    function setQueueCard(uint256 id, uint8 seat, uint8 k, uint8 card) external {
        euint8 value = FHE.asEuint8(card);
        _queue[id][seat][k] = value;
        FHE.allowThis(value);
        FHE.allow(value, _seats[id][seat].session);
    }
}
