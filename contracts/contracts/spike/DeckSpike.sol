// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

contract DeckSpike is ZamaEthereumConfig {
    uint8 public constant DECK_SIZE = 108;
    uint8 public constant LAYERS_PER_PASS = 7;
    uint8 public constant HAND_SLOTS = 24;

    euint8[108] internal _deck;
    euint8[24] internal _hand;
    euint8[24] internal _handColor;
    ebool internal _honest;
    ebool internal _bit;
    uint8 public handCount;
    bool public bitRevealed;
    bool public bitValue;

    error BadLength();
    error AlreadyRevealed();

    function init(uint8[] calldata ids) external {
        if (ids.length != DECK_SIZE) revert BadLength();
        for (uint8 i = 0; i < DECK_SIZE; i++) {
            _deck[i] = FHE.asEuint8(ids[i]);
            FHE.allowThis(_deck[i]);
        }
        _honest = FHE.asEbool(true);
        FHE.allowThis(_honest);
    }

    function shuffle(uint8 fromLayer, uint8 count) external {
        for (uint8 l = fromLayer; l < fromLayer + count; l++) {
            uint8 distance = uint8(1) << (l % LAYERS_PER_PASS);
            for (uint8 i = 0; i < DECK_SIZE; i++) {
                uint8 j = i | distance;
                if (i & distance != 0 || j >= DECK_SIZE) continue;
                ebool swap = FHE.randEbool();
                euint8 a = FHE.select(swap, _deck[j], _deck[i]);
                euint8 b = FHE.select(swap, _deck[i], _deck[j]);
                _deck[i] = a;
                _deck[j] = b;
                FHE.allowThis(a);
                FHE.allowThis(b);
            }
        }
    }

    function shuffleFused(uint8 fromLayer, uint8 count) external {
        euint8[108] memory d;
        bool[108] memory touched;
        for (uint8 i = 0; i < DECK_SIZE; i++) d[i] = _deck[i];
        for (uint8 l = fromLayer; l < fromLayer + count; l++) {
            uint8 distance = uint8(1) << (l % LAYERS_PER_PASS);
            for (uint8 i = 0; i < DECK_SIZE; i++) {
                uint8 j = i | distance;
                if (i & distance != 0 || j >= DECK_SIZE) continue;
                ebool swap = FHE.randEbool();
                euint8 a = FHE.select(swap, d[j], d[i]);
                d[j] = FHE.select(swap, d[i], d[j]);
                d[i] = a;
                touched[i] = true;
                touched[j] = true;
            }
        }
        for (uint8 i = 0; i < DECK_SIZE; i++) {
            if (!touched[i]) continue;
            _deck[i] = d[i];
            FHE.allowThis(d[i]);
        }
    }

    function onlyRand(uint8 n) external {
        for (uint8 i = 0; i < n; i++) FHE.randEbool();
    }

    function onlySelect(uint8 n) external {
        ebool b = FHE.randEbool();
        for (uint8 i = 0; i < n; i++) FHE.select(b, _deck[0], _deck[1]);
    }

    function onlyAllow(uint8 n) external {
        for (uint8 i = 0; i < n; i++) FHE.allowThis(FHE.select(FHE.asEbool(true), _deck[i], _deck[i]));
    }

    function deal(uint8 count, address player, bool trackColor) external {
        for (uint8 i = 0; i < count; i++) {
            euint8 card = _deck[handCount];
            _hand[handCount] = card;
            FHE.allow(card, player);
            if (trackColor) {
                euint8 color = FHE.shr(card, 4);
                _handColor[handCount] = color;
                FHE.allowThis(color);
            }
            handCount++;
        }
    }

    function play(uint8 slot, uint8 card) external {
        _honest = FHE.and(_honest, FHE.eq(_hand[slot], card));
        FHE.allowThis(_honest);
    }

    function drawFourIsIn(uint8 exceptSlot, uint8 color) external {
        euint8[] memory colors = new euint8[](handCount - 1);
        uint8 k = 0;
        for (uint8 i = 0; i < handCount; i++) {
            if (i == exceptSlot) continue;
            colors[k++] = _handColor[i];
        }
        _bit = FHE.isIn(FHE.asEuint8(color), colors);
        FHE.allowThis(_bit);
    }

    function drawFourNaive(uint8 exceptSlot, uint8 color) external {
        ebool any = FHE.asEbool(false);
        for (uint8 i = 0; i < handCount; i++) {
            if (i == exceptSlot) continue;
            any = FHE.or(any, FHE.eq(FHE.shr(_hand[i], 4), color));
        }
        _bit = any;
        FHE.allowThis(_bit);
    }

    function startReveal() external {
        FHE.makePubliclyDecryptable(_bit);
    }

    function finishReveal(bytes calldata cleartexts, bytes calldata proof) external {
        if (bitRevealed) revert AlreadyRevealed();
        bytes32[] memory handles = new bytes32[](1);
        handles[0] = FHE.toBytes32(_bit);
        FHE.checkSignatures(handles, cleartexts, proof);
        bitRevealed = true;
        bitValue = abi.decode(cleartexts, (bool));
    }

    function deckAt(uint8 i) external view returns (euint8) {
        return _deck[i];
    }

    function handAt(uint8 i) external view returns (euint8) {
        return _hand[i];
    }

    function honest() external view returns (ebool) {
        return _honest;
    }

    function bit() external view returns (ebool) {
        return _bit;
    }
}
