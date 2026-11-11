// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {CardLib} from "./CardLib.sol";

library KryphoScore {
    using CardLib for uint8;

    uint8 internal constant HAND_SLOTS = 24;

    function score(bytes calldata cleartexts, uint32[4] memory slots, uint8 joined, uint8 candidate, uint8 topCard)
        public
        pure
        returns (int8 winner, uint16 total, uint8 cheaters, bool bonus)
    {
        uint16[4] memory handPoints;
        bool[4] memory honest;
        uint256[4] memory secrets;
        uint256 word = 0;
        for (uint8 seat = 0; seat < joined; seat++) {
            honest[seat] = uint256(bytes32(cleartexts[word * 32:(word + 1) * 32])) != 0;
            secrets[seat] = uint256(bytes32(cleartexts[(word + 1) * 32:(word + 2) * 32]));
            word += 2;
            if (!honest[seat]) cheaters |= uint8(1) << seat;
            for (uint8 i = 0; i < HAND_SLOTS; i++) {
                if (slots[seat] & (uint32(1) << i) == 0) continue;
                handPoints[seat] += uint8(uint256(bytes32(cleartexts[word * 32:(word + 1) * 32]))).points();
                word++;
            }
        }
        winner = -1;
        if (honest[candidate]) {
            winner = int8(candidate);
        } else {
            uint16 best = type(uint16).max;
            for (uint8 seat = 0; seat < joined; seat++) {
                if (honest[seat] && handPoints[seat] < best) {
                    best = handPoints[seat];
                    winner = int8(seat);
                }
            }
        }
        if (winner < 0) return (winner, 0, cheaters, false);
        for (uint8 seat = 0; seat < joined; seat++) {
            if (int8(seat) != winner) total += handPoints[seat];
        }
        bonus = winner == int8(candidate) && secrets[candidate] == topCard.colorOf();
        if (bonus) total *= 2;
    }
}
