// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {IKryphoTable} from "./interfaces/IKryphoTable.sol";

library KryphoLobby {
    function join(mapping(uint256 => IKryphoTable.Seat[4]) storage seats, uint256 id, uint8 joined, address player, address session) public {
        for (uint8 i = 0; i < joined; i++) {
            if (seats[id][i].player == player) revert IKryphoTable.AlreadySeated();
            if (seats[id][i].session == session) revert IKryphoTable.BadSession();
        }
        seats[id][joined].player = player;
        seats[id][joined].session = session;
        emit IKryphoTable.Joined(id, joined, player, session);
    }

    function resetSeats(mapping(uint256 => IKryphoTable.Seat[4]) storage seats, uint256 id, uint8 joined) public {
        for (uint8 seat = 0; seat < joined; seat++) {
            IKryphoTable.Seat storage s = seats[id][seat];
            s.handSize = 0;
            s.slots = 0;
            s.saidMono = false;
            s.timeouts = 0;
            s.veilUsed = false;
            s.sonarUsed = false;
        }
    }

    function seatOf(mapping(uint256 => IKryphoTable.Seat[4]) storage seats, uint256 id, uint8 joined, address who) public view returns (uint8) {
        for (uint8 i = 0; i < joined; i++) {
            if (seats[id][i].player == who || seats[id][i].session == who) return i;
        }
        revert IKryphoTable.NotSeated();
    }

    /** The last seat moves into the gap so seats stay packed; a lobby has no hands or nonces yet, so nothing else refers to the index. */
    function leave(mapping(uint256 => IKryphoTable.Seat[4]) storage seats, uint256 id, uint8 joined, address who, address creator)
        public
        returns (bool wasHost, address nextHost)
    {
        uint8 seat = seatOf(seats, id, joined, who);
        uint8 last = joined - 1;
        wasHost = seats[id][seat].session == creator || seats[id][seat].player == creator;
        emit IKryphoTable.Left(id, seat, seats[id][seat].player);
        if (seat != last) seats[id][seat] = seats[id][last];
        delete seats[id][last];
        nextHost = last == 0 ? address(0) : seats[id][0].session;
    }
}
