// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

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
}
