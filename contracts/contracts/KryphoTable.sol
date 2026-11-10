// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IKryphoTable} from "./interfaces/IKryphoTable.sol";
import {KryphoDeck} from "./KryphoDeck.sol";
import {CardLib} from "./CardLib.sol";

contract KryphoTable is IKryphoTable, ZamaEthereumConfig {
    using CardLib for uint8;

    uint8 internal constant HAND_SLOTS = 24;
    uint8 internal constant HAND_START = 7;
    uint8 internal constant NONE = type(uint8).max;
    uint8 internal constant MAX_TIMEOUTS = 3;
    uint32 internal constant MIN_TURN_TIMEOUT = 30;
    uint16 internal constant MAX_TARGET_SCORE = 10_000;
    uint16 internal constant CHEAT_PENALTY = 100;
    uint64 internal constant CATCH_DELAY_BLOCKS = 2;
    uint16 internal constant SETUP_STEPS = uint16(KryphoDeck.FILL_STEPS) + KryphoDeck.SHUFFLE_STEPS;
    bytes32 internal constant ACTION_TYPEHASH =
        keccak256("Action(uint256 table,uint8 seat,uint8 kind,uint8 slot,uint8 card,uint8 color,bytes32 seenHandle,uint32 nonce)");
    bytes32 internal constant RELAY_SEAT_SLOT = keccak256("kryphochroma.relay.seat");
    uint256 internal constant HALF_ORDER = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;
    uint8 internal constant KIND_PLAY = 0;
    uint8 internal constant KIND_DRAW = 1;
    uint8 internal constant KIND_PASS = 2;
    uint8 internal constant KIND_TAKE = 3;
    uint8 internal constant KIND_MONO = 4;
    uint8 internal constant KIND_ACCEPT = 5;
    uint8 internal constant KIND_CHALLENGE = 6;
    uint8 internal constant KIND_CATCH = 7;

    bytes32 public immutable DOMAIN_SEPARATOR;

    struct Action {
        uint8 seat;
        uint8 kind;
        uint8 slot;
        uint8 card;
        uint8 color;
        bytes32 seenHandle;
        uint32 nonce;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct Seat {
        address player;
        address session;
        uint8 handSize;
        uint32 slots;
        bool saidMono;
        uint8 timeouts;
        bool abandoned;
        uint16 score;
    }

    struct Table {
        address creator;
        Config config;
        Stage stage;
        uint8 joined;
        uint8 turn;
        int8 dir;
        uint8 topCard;
        uint8 color;
        uint64 turnDeadline;
        uint16 round;
        uint16 setupStep;
        uint8 dealtMask;
        uint8 deckPtr;
        uint8 drawnSlot;
        uint8 pendingDraw;
        uint8 monoWindow;
        uint8 drawFourBy;
        uint8 prevColor;
        uint8 candidate;
        uint8 revealPrepared;
        uint64 monoBlock;
    }

    uint256 public tableCount;
    mapping(uint256 => Table) internal _tables;
    mapping(uint256 => Seat[4]) internal _seats;
    mapping(uint256 => euint8[108]) internal _deck;
    mapping(uint256 => euint8[24][4]) internal _hands;
    mapping(uint256 => euint8[24][4]) internal _handColors;
    mapping(uint256 => ebool[4]) internal _honest;
    mapping(uint256 => ebool) internal _hadColor;
    mapping(uint256 => uint8[]) internal _discard;
    mapping(uint256 => bytes32[]) internal _revealHandles;
    mapping(uint256 => uint32[4]) internal _nonces;

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Kryphochroma"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    function relay(uint256 id, Action[] calldata actions) external {
        Table storage t = _tables[id];
        for (uint256 i = 0; i < actions.length; i++) {
            Action calldata a = actions[i];
            if (a.seat >= t.joined || a.nonce != _nonces[id][a.seat]) revert BadAction();
            if (_signer(id, a) != _seats[id][a.seat].session) revert BadSignature();
            _nonces[id][a.seat] = a.nonce + 1;
            try this.relayOne(id, a) {
                emit ActionRelayed(id, a.seat, a.nonce);
            } catch (bytes memory reason) {
                emit ActionRejected(id, a.seat, a.nonce, bytes4(reason));
            }
        }
    }

    function relayOne(uint256 id, Action calldata a) external {
        if (msg.sender != address(this)) revert NotYourTurn();
        _setRelaySeat(a.seat);
        if (a.kind == KIND_PLAY) play(id, a.slot, a.card, a.color, a.seenHandle);
        else if (a.kind == KIND_DRAW) draw(id);
        else if (a.kind == KIND_PASS) pass(id);
        else if (a.kind == KIND_TAKE) takeDraws(id);
        else if (a.kind == KIND_MONO) sayMono(id, a.seat);
        else if (a.kind == KIND_ACCEPT) acceptDrawFour(id);
        else if (a.kind == KIND_CHALLENGE) challengeDrawFour(id);
        else if (a.kind == KIND_CATCH) catchMono(id, a.slot);
        else revert BadAction();
        _setRelaySeat(NONE);
    }

    function noncesOf(uint256 id) external view returns (uint32[4] memory) {
        return _nonces[id];
    }

    function createTable(Config calldata config) external returns (uint256 id) {
        if (config.seats < 2 || config.seats > 4 || config.turnTimeout < MIN_TURN_TIMEOUT || config.targetScore == 0 || config.targetScore > MAX_TARGET_SCORE) {
            revert BadConfig();
        }
        id = ++tableCount;
        Table storage t = _tables[id];
        t.creator = msg.sender;
        t.config = config;
        emit TableCreated(id, msg.sender, config);
    }

    function join(uint256 id, address session) external payable {
        Table storage t = _requireStage(id, Stage.Lobby);
        if (session == address(0)) revert BadSession();
        if (t.joined >= t.config.seats) revert TableFull();
        Seat[4] storage seats = _seats[id];
        for (uint8 i = 0; i < t.joined; i++) {
            if (seats[i].player == msg.sender) revert AlreadySeated();
        }
        uint8 seat = t.joined++;
        seats[seat].player = msg.sender;
        seats[seat].session = session;
        emit Joined(id, seat, msg.sender, session);
        if (msg.value > 0) {
            (bool ok, ) = session.call{value: msg.value}("");
            if (!ok) revert TransferFailed();
        }
    }

    function cancel(uint256 id) external {
        Table storage t = _requireStage(id, Stage.Lobby);
        if (msg.sender != t.creator) revert NotCreator();
        t.stage = Stage.MatchOver;
        emit TableCancelled(id);
    }

    function start(uint256 id) external {
        Table storage t = _requireStage(id, Stage.Lobby);
        if (msg.sender != t.creator) revert NotCreator();
        if (t.joined < 2) revert BadConfig();
        _resetRound(id, t);
    }

    function setupStep(uint256 id) external {
        Table storage t = _requireStage(id, Stage.Shuffling);
        uint16 step = t.setupStep;
        if (step < KryphoDeck.FILL_STEPS) {
            KryphoDeck.fillStep(_deck[id], uint8(step));
        } else {
            KryphoDeck.shuffleStep(_deck[id], step - KryphoDeck.FILL_STEPS);
        }
        t.setupStep = step + 1;
        emit ShuffleProgress(id, step + 1, SETUP_STEPS);
        if (step + 1 == SETUP_STEPS) t.stage = Stage.Dealing;
    }

    function dealSeat(uint256 id, uint8 seat) external {
        Table storage t = _requireStage(id, Stage.Dealing);
        if (seat >= t.joined || t.dealtMask & (uint8(1) << seat) != 0) revert BadSlot();
        for (uint8 i = 0; i < HAND_START; i++) {
            _giveCard(id, seat, i, _deck[id][i * t.joined + seat]);
        }
        Seat storage s = _seats[id][seat];
        s.handSize = HAND_START;
        s.slots = (uint32(1) << HAND_START) - 1;
        _honest[id][seat] = FHE.asEbool(true);
        FHE.allowThis(_honest[id][seat]);
        t.dealtMask |= uint8(1) << seat;
        if (t.dealtMask == (uint8(1) << t.joined) - 1) {
            t.deckPtr = HAND_START * t.joined;
            FHE.makePubliclyDecryptable(_deck[id][t.deckPtr]);
        }
    }

    function setStarter(uint256 id, bytes calldata cleartexts, bytes calldata proof) external {
        Table storage t = _requireStage(id, Stage.Dealing);
        if (t.dealtMask != (uint8(1) << t.joined) - 1) revert NotDealt();
        bytes32[] memory handles = new bytes32[](1);
        handles[0] = FHE.toBytes32(_deck[id][t.deckPtr]);
        FHE.checkSignatures(handles, cleartexts, proof);
        uint8 card = uint8(uint256(bytes32(cleartexts[0:32])));
        t.deckPtr++;
        _discard[id].push(card);
        if (!card.isNumber()) {
            FHE.makePubliclyDecryptable(_deck[id][t.deckPtr]);
            return;
        }
        t.topCard = card;
        t.color = card.colorOf();
        t.stage = Stage.Playing;
        t.turn = uint8(t.round % t.joined);
        _refreshDeadline(t);
        emit Dealt(id, t.round, t.turn, card);
    }

    function play(uint256 id, uint8 slot, uint8 card, uint8 chosenColor, bytes32 seenHandle) public {
        Table storage t = _requireStage(id, Stage.Playing);
        if (t.drawFourBy != NONE) revert DrawFourPending();
        uint8 seat = _requireTurn(id, t);
        if (t.pendingDraw > 0 && !card.isDrawTwo()) revert MustStackOrTake();
        Seat storage s = _seats[id][seat];
        if (slot >= HAND_SLOTS || s.slots & (uint32(1) << slot) == 0) revert BadSlot();
        if (FHE.toBytes32(_hands[id][seat][slot]) != seenHandle) revert StaleHand();
        if (t.drawnSlot != NONE && slot != t.drawnSlot) revert MustPlayDrawnCard();
        if (!card.isValid()) revert BadCard();
        if (!card.matches(t.topCard, t.color)) revert IllegalCard();
        if (card.isWild() && chosenColor > 3) revert BadColor();

        _honest[id][seat] = FHE.and(_honest[id][seat], FHE.eq(_hands[id][seat][slot], card));
        FHE.allowThis(_honest[id][seat]);
        uint8 prevColor = t.color;
        if (card == CardLib.WILD_DRAW_FOUR) _recordHadColor(id, seat, slot, prevColor);

        s.slots &= ~(uint32(1) << slot);
        s.handSize--;
        _discard[id].push(card);
        t.topCard = card;
        t.color = card.isWild() ? chosenColor : card.colorOf();
        t.monoWindow = NONE;
        t.drawnSlot = NONE;
        s.timeouts = 0;
        emit Played(id, seat, slot, card, t.color);

        if (s.handSize == 0) {
            if (card.isDrawTwo()) _drawInto(id, t, _seatAt(t, 1), t.pendingDraw + 2);
            if (card == CardLib.WILD_DRAW_FOUR) _drawInto(id, t, _seatAt(t, 1), 4);
            t.pendingDraw = 0;
            _beginReveal(id, t, seat);
            return;
        }
        if (s.handSize == 1 && !s.saidMono) {
            t.monoWindow = seat;
            t.monoBlock = uint64(block.number);
        }
        _applyEffect(id, t, card, seat, prevColor);
    }

    function draw(uint256 id) public {
        Table storage t = _requireStage(id, Stage.Playing);
        if (t.drawFourBy != NONE) revert DrawFourPending();
        if (t.pendingDraw > 0) revert DrawPending();
        uint8 seat = _requireTurn(id, t);
        if (t.drawnSlot != NONE) revert AlreadyDrew();
        if (!_canDraw(id, t, seat)) revert CannotDraw();
        t.drawnSlot = _drawInto(id, t, seat, 1);
        t.monoWindow = NONE;
        _seats[id][seat].timeouts = 0;
    }

    function pass(uint256 id) public {
        Table storage t = _requireStage(id, Stage.Playing);
        if (t.drawFourBy != NONE) revert DrawFourPending();
        if (t.pendingDraw > 0) revert DrawPending();
        uint8 seat = _requireTurn(id, t);
        if (t.drawnSlot == NONE && _canDraw(id, t, seat)) revert CannotPass();
        t.drawnSlot = NONE;
        t.monoWindow = NONE;
        _seats[id][seat].timeouts = 0;
        emit Passed(id, seat);
        _advance(t, 1);
    }

    function takeDraws(uint256 id) public {
        Table storage t = _requireStage(id, Stage.Playing);
        if (t.pendingDraw == 0) revert NoPendingDraw();
        uint8 seat = _requireTurn(id, t);
        uint8 count = t.pendingDraw;
        t.monoWindow = NONE;
        _seats[id][seat].timeouts = 0;
        emit DrawsTaken(id, seat, count);
        _drawInto(id, t, seat, count);
        t.pendingDraw = 0;
        _advance(t, 1);
    }

    function sayMono(uint256 id, uint8 seat) public {
        Table storage t = _requireStage(id, Stage.Playing);
        if (seat >= t.joined || !_isActor(id, seat)) revert NotYourTurn();
        Seat storage s = _seats[id][seat];
        bool window = t.monoWindow == seat && s.handSize == 1;
        bool early = t.turn == seat && s.handSize == 2 && t.drawFourBy == NONE;
        if (s.saidMono || !(window || early)) revert CannotSayMono();
        s.saidMono = true;
        if (t.monoWindow == seat) t.monoWindow = NONE;
        emit MonoSaid(id, seat);
    }

    function catchMono(uint256 id, uint8 target) public {
        Table storage t = _requireStage(id, Stage.Playing);
        if (target >= t.joined || t.monoWindow != target) revert CannotCatch();
        Seat storage s = _seats[id][target];
        if (s.handSize != 1 || s.saidMono || !_isOtherSeat(id, t, target)) revert CannotCatch();
        if (block.number < t.monoBlock + CATCH_DELAY_BLOCKS) revert CatchTooEarly();
        t.monoWindow = NONE;
        emit MonoCaught(id, target);
        _drawInto(id, t, target, 2);
    }

    function acceptDrawFour(uint256 id) public {
        Table storage t = _requireStage(id, Stage.Playing);
        if (t.drawFourBy == NONE) revert NoDrawFour();
        uint8 seat = _requireTurn(id, t);
        t.monoWindow = NONE;
        _seats[id][seat].timeouts = 0;
        emit DrawFourAccepted(id, seat);
        _drawInto(id, t, seat, 4);
        t.drawFourBy = NONE;
        _advance(t, 1);
    }

    function challengeDrawFour(uint256 id) public {
        Table storage t = _requireStage(id, Stage.Playing);
        if (t.drawFourBy == NONE) revert NoDrawFour();
        uint8 seat = _requireTurn(id, t);
        t.monoWindow = NONE;
        _seats[id][seat].timeouts = 0;
        t.stage = Stage.AwaitChallenge;
        FHE.makePubliclyDecryptable(_hadColor[id]);
        emit DrawFourChallenged(id, seat);
    }

    function resolveChallenge(uint256 id, bytes calldata cleartexts, bytes calldata proof) external {
        Table storage t = _requireStage(id, Stage.AwaitChallenge);
        bytes32[] memory handles = new bytes32[](1);
        handles[0] = FHE.toBytes32(_hadColor[id]);
        FHE.checkSignatures(handles, cleartexts, proof);
        bool hadColor = uint256(bytes32(cleartexts[0:32])) != 0;
        emit ChallengeResolved(id, hadColor);
        t.stage = Stage.Playing;
        if (hadColor) {
            _drawInto(id, t, t.drawFourBy, 4);
            _refreshDeadline(t);
        } else {
            _drawInto(id, t, t.turn, 6);
            _advance(t, 1);
        }
        t.drawFourBy = NONE;
    }

    function forceTimeout(uint256 id) external {
        Table storage t = _requireStage(id, Stage.Playing);
        if (block.timestamp <= t.turnDeadline) revert TurnNotExpired();
        uint8 seat = t.turn;
        Seat storage s = _seats[id][seat];
        emit TimedOut(id, seat);
        if (t.drawFourBy != NONE) {
            _drawInto(id, t, seat, 4);
            t.drawFourBy = NONE;
        } else if (t.pendingDraw > 0) {
            _drawInto(id, t, seat, t.pendingDraw);
            t.pendingDraw = 0;
        } else if (t.drawnSlot == NONE && _canDraw(id, t, seat)) {
            _drawInto(id, t, seat, 1);
        }
        t.drawnSlot = NONE;
        t.monoWindow = NONE;
        s.timeouts++;
        if (s.timeouts >= MAX_TIMEOUTS && !s.abandoned) {
            s.abandoned = true;
            emit SeatAbandoned(id, seat);
        }
        _advance(t, 1);
    }

    function prepareReveal(uint256 id) external {
        Table storage t = _requireStage(id, Stage.Revealing);
        uint8 seat = t.revealPrepared;
        if (seat >= t.joined) revert RevealNotReady();
        bytes32[] storage handles = _revealHandles[id];
        FHE.makePubliclyDecryptable(_honest[id][seat]);
        handles.push(FHE.toBytes32(_honest[id][seat]));
        uint32 slots = _seats[id][seat].slots;
        for (uint8 i = 0; i < HAND_SLOTS; i++) {
            if (slots & (uint32(1) << i) == 0) continue;
            FHE.makePubliclyDecryptable(_hands[id][seat][i]);
            handles.push(FHE.toBytes32(_hands[id][seat][i]));
        }
        t.revealPrepared = seat + 1;
    }

    function finishReveal(uint256 id, bytes calldata cleartexts, bytes calldata proof) external {
        Table storage t = _requireStage(id, Stage.Revealing);
        if (t.revealPrepared != t.joined) revert RevealNotReady();
        FHE.checkSignatures(_revealHandles[id], cleartexts, proof);
        (int8 winner, uint16 points, uint8 cheaters) = _score(id, t, cleartexts);
        if (winner >= 0) _seats[id][uint8(winner)].score += points;
        for (uint8 seat = 0; seat < t.joined; seat++) {
            if (cheaters & (uint8(1) << seat) == 0) continue;
            Seat storage c = _seats[id][seat];
            c.score = c.score > CHEAT_PENALTY ? c.score - CHEAT_PENALTY : 0;
        }
        emit RoundSettled(id, winner, points, cheaters);
        bool over = t.config.singleRound || (winner >= 0 && _seats[id][uint8(winner)].score >= t.config.targetScore);
        t.stage = over ? Stage.MatchOver : Stage.RoundOver;
        if (over) emit MatchOver(id, winner);
    }

    function nextRound(uint256 id) external {
        Table storage t = _requireStage(id, Stage.RoundOver);
        t.round++;
        _resetRound(id, t);
    }

    function getTable(uint256 id) external view returns (Table memory) {
        return _tables[id];
    }

    function getSeat(uint256 id, uint8 seat) external view returns (Seat memory) {
        return _seats[id][seat];
    }

    function handOf(uint256 id, uint8 seat) external view returns (euint8[24] memory) {
        return _hands[id][seat];
    }

    function honestOf(uint256 id, uint8 seat) external view returns (ebool) {
        return _honest[id][seat];
    }

    function hadColorOf(uint256 id) external view returns (ebool) {
        return _hadColor[id];
    }

    function deckCardAt(uint256 id, uint8 index) external view returns (euint8) {
        return _deck[id][index];
    }

    function discardOf(uint256 id) external view returns (uint8[] memory) {
        return _discard[id];
    }

    function revealHandles(uint256 id) external view returns (bytes32[] memory) {
        return _revealHandles[id];
    }

    function _requireStage(uint256 id, Stage stage) internal view returns (Table storage t) {
        t = _tables[id];
        if (t.creator == address(0) || t.stage != stage) revert WrongStage(stage, t.stage);
    }

    function _isActor(uint256 id, uint8 seat) internal view returns (bool) {
        uint8 relayed = _relaySeat();
        if (relayed != NONE) return relayed == seat;
        Seat storage s = _seats[id][seat];
        return msg.sender == s.session || msg.sender == s.player;
    }

    function _relaySeat() internal view returns (uint8 seat) {
        bytes32 slot = RELAY_SEAT_SLOT;
        uint256 raw;
        assembly {
            raw := tload(slot)
        }
        return raw == 0 ? NONE : uint8(raw - 1);
    }

    function _setRelaySeat(uint8 seat) internal {
        bytes32 slot = RELAY_SEAT_SLOT;
        uint256 raw = seat == NONE ? 0 : uint256(seat) + 1;
        assembly {
            tstore(slot, raw)
        }
    }

    function _signer(uint256 id, Action calldata a) internal view returns (address) {
        if (uint256(a.s) > HALF_ORDER) revert BadSignature();
        bytes32 structHash = keccak256(abi.encode(ACTION_TYPEHASH, id, a.seat, a.kind, a.slot, a.card, a.color, a.seenHandle, a.nonce));
        address signer = ecrecover(keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)), a.v, a.r, a.s);
        if (signer == address(0)) revert BadSignature();
        return signer;
    }

    function _isOtherSeat(uint256 id, Table storage t, uint8 target) internal view returns (bool) {
        for (uint8 seat = 0; seat < t.joined; seat++) {
            if (seat != target && _isActor(id, seat)) return true;
        }
        return false;
    }

    function _requireTurn(uint256 id, Table storage t) internal view returns (uint8) {
        if (!_isActor(id, t.turn)) revert NotYourTurn();
        return t.turn;
    }

    function _seatAt(Table storage t, uint8 offset) internal view returns (uint8) {
        int16 n = int16(uint16(t.joined));
        int16 next = (int16(uint16(t.turn)) + int16(t.dir) * int16(uint16(offset))) % n;
        return uint8(uint16(next < 0 ? next + n : next));
    }

    function _refreshDeadline(Table storage t) internal {
        t.turnDeadline = uint64(block.timestamp) + t.config.turnTimeout;
    }

    function _advance(Table storage t, uint8 offset) internal {
        t.turn = _seatAt(t, offset);
        _refreshDeadline(t);
    }

    function _canDraw(uint256 id, Table storage t, uint8 seat) internal view returns (bool) {
        return t.deckPtr < KryphoDeck.DECK_SIZE && _seats[id][seat].slots != (uint32(1) << HAND_SLOTS) - 1;
    }

    function _giveCard(uint256 id, uint8 seat, uint8 slot, euint8 card) internal {
        _hands[id][seat][slot] = card;
        FHE.allow(card, _seats[id][seat].session);
        euint8 color = FHE.shr(card, 4);
        _handColors[id][seat][slot] = color;
        FHE.allowThis(color);
    }

    function _drawInto(uint256 id, Table storage t, uint8 seat, uint8 count) internal returns (uint8 lastSlot) {
        Seat storage s = _seats[id][seat];
        lastSlot = NONE;
        for (uint8 k = 0; k < count; k++) {
            if (t.deckPtr >= KryphoDeck.DECK_SIZE) break;
            uint8 slot = _freeSlot(s.slots);
            if (slot == NONE) break;
            _giveCard(id, seat, slot, _deck[id][t.deckPtr]);
            t.deckPtr++;
            s.slots |= uint32(1) << slot;
            s.handSize++;
            s.saidMono = false;
            lastSlot = slot;
            emit Drew(id, seat, slot);
        }
    }

    function _freeSlot(uint32 slots) internal pure returns (uint8) {
        for (uint8 i = 0; i < HAND_SLOTS; i++) {
            if (slots & (uint32(1) << i) == 0) return i;
        }
        return NONE;
    }

    function _recordHadColor(uint256 id, uint8 seat, uint8 slot, uint8 prevColor) internal {
        uint32 others = _seats[id][seat].slots & ~(uint32(1) << slot);
        uint8 count = 0;
        for (uint8 i = 0; i < HAND_SLOTS; i++) if (others & (uint32(1) << i) != 0) count++;
        ebool had;
        if (count == 0) {
            had = FHE.asEbool(false);
        } else {
            euint8[] memory colors = new euint8[](count);
            uint8 k = 0;
            for (uint8 i = 0; i < HAND_SLOTS; i++) {
                if (others & (uint32(1) << i) != 0) colors[k++] = _handColors[id][seat][i];
            }
            had = FHE.isIn(FHE.asEuint8(prevColor), colors);
        }
        _hadColor[id] = had;
        FHE.allowThis(had);
        _tables[id].prevColor = prevColor;
    }

    function _applyEffect(uint256 id, Table storage t, uint8 card, uint8 seat, uint8 prevColor) internal {
        uint8 rank = card.rankOf();
        if (card == CardLib.WILD_DRAW_FOUR) {
            _advance(t, 1);
            t.drawFourBy = seat;
            t.prevColor = prevColor;
        } else if (card.isWild()) {
            _advance(t, 1);
        } else if (rank == CardLib.SKIP) {
            _advance(t, 2);
        } else if (rank == CardLib.REVERSE) {
            t.dir = -t.dir;
            _advance(t, t.joined == 2 ? 2 : 1);
        } else if (rank == CardLib.DRAW_TWO && t.config.stackDrawTwo) {
            t.pendingDraw += 2;
            _advance(t, 1);
        } else if (rank == CardLib.DRAW_TWO) {
            _drawInto(id, t, _seatAt(t, 1), 2);
            _advance(t, 2);
        } else {
            _advance(t, 1);
        }
    }

    function _beginReveal(uint256 id, Table storage t, uint8 candidate) internal {
        t.stage = Stage.Revealing;
        t.candidate = candidate;
        t.drawFourBy = NONE;
        t.drawnSlot = NONE;
        t.monoWindow = NONE;
        t.revealPrepared = 0;
        emit RevealStarted(id, candidate);
    }

    function _score(uint256 id, Table storage t, bytes calldata cleartexts)
        internal
        view
        returns (int8 winner, uint16 total, uint8 cheaters)
    {
        uint16[4] memory handPoints;
        bool[4] memory honest;
        uint256 word = 0;
        for (uint8 seat = 0; seat < t.joined; seat++) {
            honest[seat] = uint256(bytes32(cleartexts[word * 32:(word + 1) * 32])) != 0;
            word++;
            if (!honest[seat]) cheaters |= uint8(1) << seat;
            uint32 slots = _seats[id][seat].slots;
            for (uint8 i = 0; i < HAND_SLOTS; i++) {
                if (slots & (uint32(1) << i) == 0) continue;
                handPoints[seat] += uint8(uint256(bytes32(cleartexts[word * 32:(word + 1) * 32]))).points();
                word++;
            }
        }
        winner = -1;
        if (honest[t.candidate]) {
            winner = int8(t.candidate);
        } else {
            uint16 best = type(uint16).max;
            for (uint8 seat = 0; seat < t.joined; seat++) {
                if (honest[seat] && handPoints[seat] < best) {
                    best = handPoints[seat];
                    winner = int8(seat);
                }
            }
        }
        if (winner < 0) return (winner, 0, cheaters);
        for (uint8 seat = 0; seat < t.joined; seat++) {
            if (int8(seat) != winner) total += handPoints[seat];
            if (cheaters & (uint8(1) << seat) != 0) total += CHEAT_PENALTY;
        }
    }

    function _resetRound(uint256 id, Table storage t) internal {
        t.stage = Stage.Shuffling;
        t.setupStep = 0;
        t.dealtMask = 0;
        t.deckPtr = 0;
        t.dir = 1;
        t.drawnSlot = NONE;
        t.pendingDraw = 0;
        t.monoWindow = NONE;
        t.drawFourBy = NONE;
        t.candidate = NONE;
        delete _discard[id];
        delete _revealHandles[id];
        for (uint8 seat = 0; seat < t.joined; seat++) {
            Seat storage s = _seats[id][seat];
            s.handSize = 0;
            s.slots = 0;
            s.saidMono = false;
            s.timeouts = 0;
        }
    }
}
