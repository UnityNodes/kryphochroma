// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8} from "@fhevm/solidity/lib/FHE.sol";
import {IKryphoTable} from "./interfaces/IKryphoTable.sol";
import {KryphoDeck} from "./KryphoDeck.sol";

library KryphoHand {
    uint8 internal constant HAND_SLOTS = 24;
    uint8 internal constant NEXT_CARDS = 2;
    uint8 internal constant SECRET_COLORS = 5;
    uint8 internal constant NONE = type(uint8).max;

    function give(
        mapping(uint256 => euint8[24][4]) storage hands,
        mapping(uint256 => euint8[24][4]) storage colors,
        uint256 id,
        uint8 seat,
        uint8 slot,
        euint8 card,
        address session
    ) public {
        _give(hands, colors, id, seat, slot, card, session);
    }

    function seatUp(mapping(uint256 => ebool[4]) storage honest, mapping(uint256 => euint8[4]) storage secrets, uint256 id, uint8 seat, address session) public {
        honest[id][seat] = FHE.asEbool(true);
        FHE.allowThis(honest[id][seat]);
        euint8 secret = FHE.rem(FHE.randEuint8(), SECRET_COLORS);
        secrets[id][seat] = secret;
        FHE.allowThis(secret);
        FHE.allow(secret, session);
    }

    function handOver(
        mapping(uint256 => euint8[24][4]) storage hands,
        mapping(uint256 => euint8[2][4]) storage queues,
        uint256 id,
        uint8 seat,
        uint32 slots,
        address takeover
    ) public {
        for (uint8 i = 0; i < HAND_SLOTS; i++) {
            if (slots & (uint32(1) << i) != 0) FHE.allow(hands[id][seat][i], takeover);
        }
        for (uint8 k = 0; k < NEXT_CARDS; k++) {
            if (FHE.isInitialized(queues[id][seat][k])) FHE.allow(queues[id][seat][k], takeover);
        }
    }

    function verify(bytes32[] memory handles, bytes calldata cleartexts, bytes calldata proof) public {
        FHE.checkSignatures(handles, cleartexts, proof);
    }

    function verifyOne(bytes32 handle, bytes calldata cleartexts, bytes calldata proof) public returns (uint256) {
        bytes32[] memory handles = new bytes32[](1);
        handles[0] = handle;
        FHE.checkSignatures(handles, cleartexts, proof);
        return uint256(bytes32(cleartexts[0:32]));
    }

    function swapRefill(IKryphoTable.Table storage t, uint256 id) public returns (bool) {
        return _swapRefill(t, id);
    }

    /** Each seat holds its next cards already open to it, so a draw lands in a hand its owner can read at once instead of waiting a block and a decryption; the deck order stays hidden from everyone else. */

    function fill(
        mapping(uint256 => euint8[138]) storage deck,
        mapping(uint256 => euint8[2][4]) storage queues,
        IKryphoTable.Table storage t,
        uint256 id,
        uint8 seat,
        address session
    ) public {
        for (uint8 k = 0; k < NEXT_CARDS; k++) {
            if (!FHE.isInitialized(queues[id][seat][NEXT_CARDS - 1])) _enqueue(deck, queues, t, id, seat, session);
        }
    }

    function drawInto(
        mapping(uint256 => euint8[138]) storage deck,
        mapping(uint256 => euint8[2][4]) storage queues,
        mapping(uint256 => euint8[24][4]) storage hands,
        mapping(uint256 => euint8[24][4]) storage colors,
        IKryphoTable.Seat storage s,
        IKryphoTable.Table storage t,
        uint256 id,
        uint8 seat,
        uint8 count
    ) public returns (uint8 lastSlot) {
        lastSlot = NONE;
        for (uint8 k = 0; k < count; k++) {
            uint8 slot = _freeSlot(s.slots);
            if (slot == NONE) break;
            euint8 card = _nextCard(deck, queues, t, id, seat, s.session);
            if (!FHE.isInitialized(card)) break;
            _give(hands, colors, id, seat, slot, card, s.session);
            s.slots |= uint32(1) << slot;
            s.handSize++;
            s.saidMono = false;
            lastSlot = slot;
            emit IKryphoTable.Drew(id, seat, slot);
        }
    }

    function _give(
        mapping(uint256 => euint8[24][4]) storage hands,
        mapping(uint256 => euint8[24][4]) storage colors,
        uint256 id,
        uint8 seat,
        uint8 slot,
        euint8 card,
        address session
    ) private {
        hands[id][seat][slot] = card;
        FHE.allow(card, session);
        euint8 color = FHE.shr(card, 4);
        colors[id][seat][slot] = color;
        FHE.allowThis(color);
    }

    function _enqueue(
        mapping(uint256 => euint8[138]) storage deck,
        mapping(uint256 => euint8[2][4]) storage queues,
        IKryphoTable.Table storage t,
        uint256 id,
        uint8 seat,
        address session
    ) private {
        if (t.deckPtr >= t.deckEnd && !_swapRefill(t, id)) return;
        euint8 card = deck[id][t.deckPtr++];
        FHE.allow(card, session);
        euint8[2] storage q = queues[id][seat];
        if (!FHE.isInitialized(q[0])) q[0] = card;
        else q[1] = card;
    }

    function _nextCard(
        mapping(uint256 => euint8[138]) storage deck,
        mapping(uint256 => euint8[2][4]) storage queues,
        IKryphoTable.Table storage t,
        uint256 id,
        uint8 seat,
        address session
    ) private returns (euint8 card) {
        euint8[2] storage q = queues[id][seat];
        card = q[0];
        if (FHE.isInitialized(card)) {
            q[0] = q[1];
            q[1] = euint8.wrap(0);
        } else if (t.deckPtr < t.deckEnd || _swapRefill(t, id)) {
            card = deck[id][t.deckPtr++];
        }
        if (FHE.isInitialized(card)) _enqueue(deck, queues, t, id, seat, session);
    }

    function _swapRefill(IKryphoTable.Table storage t, uint256 id) private returns (bool) {
        if (t.refillSize == 0 || t.refillStep != KryphoDeck.fillSteps(t.refillSize)) return false;
        t.deckPtr = t.refillAt;
        t.deckEnd = t.refillAt + t.refillSize;
        emit IKryphoTable.Reshuffled(id, t.refillSize);
        t.refillSize = 0;
        t.refillStep = 0;
        return true;
    }

    function _freeSlot(uint32 slots) private pure returns (uint8) {
        for (uint8 i = 0; i < HAND_SLOTS; i++) {
            if (slots & (uint32(1) << i) == 0) return i;
        }
        return NONE;
    }
}
