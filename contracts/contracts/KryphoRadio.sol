// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8} from "@fhevm/solidity/lib/FHE.sol";
import {IKryphoTable} from "./interfaces/IKryphoTable.sol";

library KryphoRadio {
    uint8 internal constant HAND_SLOTS = 24;
    bytes32 internal constant ACTION_TYPEHASH =
        keccak256("Action(uint256 table,uint8 seat,uint8 kind,uint8 slot,uint8 card,uint8 color,bytes32 seenHandle,uint32 nonce)");
    uint256 internal constant HALF_ORDER = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    /** Low-s only, so one signed action has exactly one valid signature and cannot be replayed in a malleated form. */
    function signer(bytes32 domain, uint256 id, IKryphoTable.Action calldata a) public pure returns (address) {
        if (uint256(a.s) > HALF_ORDER) return address(0);
        bytes32 structHash = keccak256(abi.encode(ACTION_TYPEHASH, id, a.seat, a.kind, a.slot, a.card, a.color, a.seenHandle, a.nonce));
        return ecrecover(keccak256(abi.encodePacked("\x19\x01", domain, structHash)), a.v, a.r, a.s);
    }

    function hadColor(mapping(uint256 => euint8[24][4]) storage colors, uint256 id, uint8 seat, uint32 others, uint8 prevColor) public returns (ebool had) {
        uint8 count = 0;
        for (uint8 i = 0; i < HAND_SLOTS; i++) if (others & (uint32(1) << i) != 0) count++;
        if (count == 0) {
            had = FHE.asEbool(false);
        } else {
            euint8[] memory list = new euint8[](count);
            uint8 k = 0;
            for (uint8 i = 0; i < HAND_SLOTS; i++) {
                if (others & (uint32(1) << i) != 0) list[k++] = colors[id][seat][i];
            }
            had = FHE.isIn(FHE.asEuint8(prevColor), list);
        }
        FHE.allowThis(had);
    }

    function ping(mapping(uint256 => euint8[24][4]) storage colors, uint256 id, uint8 target, uint32 slots, uint8 color, address listener)
        public
        returns (euint8 count)
    {
        count = FHE.asEuint8(0);
        euint8 one = FHE.asEuint8(1);
        euint8 zero = count;
        for (uint8 i = 0; i < HAND_SLOTS; i++) {
            if (slots & (uint32(1) << i) == 0) continue;
            count = FHE.add(count, FHE.select(FHE.eq(colors[id][target][i], color), one, zero));
        }
        FHE.allowThis(count);
        FHE.allow(count, listener);
    }
}
