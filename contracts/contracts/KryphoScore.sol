// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8} from "@fhevm/solidity/lib/FHE.sol";
import {CardLib} from "./CardLib.sol";
import {IKryphoTable} from "./interfaces/IKryphoTable.sol";

library KryphoScore {
    using CardLib for uint8;

    uint8 internal constant HAND_SLOTS = 24;
    uint16 internal constant CHEAT_PENALTY = 100;

    function settle(
        mapping(uint256 => IKryphoTable.Seat[4]) storage seats,
        uint256 id,
        bytes calldata cleartexts,
        uint8 joined,
        uint8 candidate,
        uint8 topCard,
        bool singleRound,
        uint16 target
    ) public returns (int8 winner, bool over) {
        uint32[4] memory slots;
        for (uint8 seat = 0; seat < joined; seat++) slots[seat] = seats[id][seat].slots;
        uint16 points;
        uint8 cheaters;
        bool bonus;
        (winner, points, cheaters, bonus) = score(cleartexts, slots, joined, candidate, topCard);
        for (uint8 seat = 0; seat < joined; seat++) {
            if (cheaters & (uint8(1) << seat) == 0) continue;
            IKryphoTable.Seat storage c = seats[id][seat];
            uint16 taken = c.score < CHEAT_PENALTY ? c.score : CHEAT_PENALTY;
            c.score -= taken;
            if (winner >= 0) points += taken;
        }
        if (winner >= 0) seats[id][uint8(winner)].score += points;
        emit IKryphoTable.RoundSettled(id, winner, points, cheaters, bonus);
        over = singleRound || (winner >= 0 && seats[id][uint8(winner)].score >= target);
    }

    function expose(
        bytes32[] storage handles,
        ebool honest,
        euint8 secret,
        mapping(uint256 => euint8[24][4]) storage hands,
        uint256 id,
        uint8 seat,
        uint32 slots
    ) public {
        FHE.makePubliclyDecryptable(honest);
        handles.push(FHE.toBytes32(honest));
        FHE.makePubliclyDecryptable(secret);
        handles.push(FHE.toBytes32(secret));
        for (uint8 i = 0; i < HAND_SLOTS; i++) {
            if (slots & (uint32(1) << i) == 0) continue;
            FHE.makePubliclyDecryptable(hands[id][seat][i]);
            handles.push(FHE.toBytes32(hands[id][seat][i]));
        }
    }

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
