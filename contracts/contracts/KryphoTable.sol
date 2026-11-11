// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FHE, ebool, euint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IKryphoTable} from "./interfaces/IKryphoTable.sol";
import {KryphoDeck} from "./KryphoDeck.sol";
import {CardLib} from "./CardLib.sol";
import {KryphoScore} from "./KryphoScore.sol";
import {KryphoRadio} from "./KryphoRadio.sol";
import {KryphoLobby} from "./KryphoLobby.sol";

contract KryphoTable is IKryphoTable, ZamaEthereumConfig {
    using CardLib for uint8;

    uint8 internal constant HAND_SLOTS = 24;
    uint8 internal constant HAND_START = 7;
    uint8 internal constant NONE = type(uint8).max;
    uint8 internal constant MAX_TIMEOUTS = 3;
    uint8 internal constant REFILL_AT = 48;
    uint256 internal constant STARTER_BATCH = 1;
    uint32 internal constant MIN_TURN_TIMEOUT = 30;
    uint32 internal constant MAX_TURN_TIMEOUT = 1 days;
    uint8 internal constant MIN_REFILL = 16;
    uint256 internal constant SESSION_STIPEND = 10_000;
    uint16 internal constant MAX_TARGET_SCORE = 10_000;
    uint64 internal constant CATCH_DELAY_BLOCKS = 2;
    uint16 internal constant SETUP_STEPS = uint16(KryphoDeck.FILL_STEPS) + KryphoDeck.SHUFFLE_STEPS;
    bytes32 internal constant RELAY_SEAT_SLOT = keccak256("kryphochroma.relay.seat");
    uint8 internal constant KIND_PLAY = 0;
    uint8 internal constant KIND_DRAW = 1;
    uint8 internal constant KIND_PASS = 2;
    uint8 internal constant KIND_TAKE = 3;
    uint8 internal constant KIND_MONO = 4;
    uint8 internal constant KIND_ACCEPT = 5;
    uint8 internal constant KIND_CHALLENGE = 6;
    uint8 internal constant KIND_CATCH = 7;
    uint8 internal constant KIND_VEIL = 8;
    uint8 internal constant KIND_DOUBT = 9;
    uint8 internal constant KIND_SONAR = 10;
    uint8 internal constant SECRET_COLORS = 5;
    uint8 internal constant VEIL_TRUE_DRAW = 2;
    uint8 internal constant VEIL_LIE_DRAW = 4;

    bytes32 public immutable DOMAIN_SEPARATOR;
    address public immutable TAKEOVER;

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
        uint8 deckEnd;
        uint8 refillAt;
        uint8 refillSize;
        uint8 refillStep;
        uint16 refillFrom;
        uint16 discardBase;
        uint8 drawnSlot;
        uint8 pendingDraw;
        uint8 monoWindow;
        uint8 drawFourBy;
        uint8 veilBy;
        uint8 veilJudge;
        uint8 prevColor;
        uint8 candidate;
        uint8 revealPrepared;
        uint64 monoBlock;
    }

    uint256 public tableCount;
    mapping(uint256 => Table) internal _tables;
    mapping(uint256 => Seat[4]) internal _seats;
    mapping(uint256 => euint8[138]) internal _deck;
    mapping(uint256 => euint8[4]) internal _secret;
    mapping(uint256 => euint8[24][4]) internal _hands;
    mapping(uint256 => euint8[24][4]) internal _handColors;
    mapping(uint256 => ebool[4]) internal _honest;
    mapping(uint256 => ebool) internal _hadColor;
    mapping(uint256 => uint8[]) internal _discard;
    mapping(uint256 => bytes32[]) internal _revealHandles;
    mapping(uint256 => uint32[4]) internal _nonces;
    mapping(uint256 => euint8[4]) internal _sonar;

    constructor(address takeover) {
        TAKEOVER = takeover;
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
            if (a.seat >= t.joined || a.nonce != _nonces[id][a.seat]) continue;
            if (_signer(id, a) != _seats[id][a.seat].session) revert BadSignature();
            _nonces[id][a.seat] = a.nonce + 1;
            try this.relayOne(id, a) {
                emit ActionRelayed(id, a.seat, a.nonce);
            } catch (bytes memory reason) {
                if (reason.length == 0) revert BadAction();
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
        else if (a.kind == KIND_VEIL) veil(id, a.slot, a.card, a.seenHandle);
        else if (a.kind == KIND_DOUBT) doubtVeil(id);
        else if (a.kind == KIND_SONAR) sonar(id, a.slot, a.color);
        else revert BadAction();
        _setRelaySeat(NONE);
    }

    function noncesOf(uint256 id) external view returns (uint32[4] memory) {
        return _nonces[id];
    }

    function createTable(Config calldata config) public returns (uint256 id) {
        if (config.seats < 2 || config.seats > 4 || config.turnTimeout < MIN_TURN_TIMEOUT || config.turnTimeout > MAX_TURN_TIMEOUT || config.targetScore == 0 || config.targetScore > MAX_TARGET_SCORE) {
            revert BadConfig();
        }
        id = ++tableCount;
        Table storage t = _tables[id];
        t.creator = msg.sender;
        t.config = config;
        emit TableCreated(id, msg.sender, config);
    }

    function openTable(Config calldata config, address session) external returns (uint256 id) {
        id = createTable(config);
        if (session == address(0) || session == TAKEOVER) revert BadSession();
        KryphoLobby.join(_seats, id, _tables[id].joined++, msg.sender, session);
    }

    function join(uint256 id, address session) external payable {
        Table storage t = _requireStage(id, Stage.Lobby);
        if (session == address(0) || session == TAKEOVER) revert BadSession();
        if (t.joined >= t.config.seats) revert TableFull();
        KryphoLobby.join(_seats, id, t.joined++, msg.sender, session);
        if (msg.value > 0) {
            (bool ok, ) = session.call{value: msg.value, gas: SESSION_STIPEND}("");
            if (!ok) revert TransferFailed();
        }
    }

    function cancel(uint256 id) external {
        Table storage t = _requireStage(id, Stage.Lobby);
        if (msg.sender != t.creator) revert NotCreator();
        t.stage = Stage.MatchOver;
        emit TableCancelled(id);
    }

    function leave(uint256 id) external {
        Table storage t = _requireStage(id, Stage.Lobby);
        (bool wasHost, address next) = KryphoLobby.leave(_seats, id, t.joined, msg.sender, t.creator);
        t.joined--;
        if (t.joined == 0) {
            t.stage = Stage.MatchOver;
            emit TableCancelled(id);
        } else if (wasHost) {
            t.creator = next;
        }
    }

    /** A full table may be started by anyone seated at it, so a host who closed the tab can not lock three other players in the lobby. */
    function start(uint256 id) external {
        Table storage t = _requireStage(id, Stage.Lobby);
        if (msg.sender != t.creator) {
            if (t.joined < t.config.seats) revert NotCreator();
            KryphoLobby.seatOf(_seats, id, t.joined, msg.sender);
        }
        if (t.joined < 2) revert BadConfig();
        uint16 done = t.setupStep;
        _resetRound(id, t);
        t.setupStep = done;
        if (done == SETUP_STEPS) t.stage = Stage.Dealing;
    }

    function setupStep(uint256 id) external {
        Table storage t = _tables[id];
        bool early = t.stage == Stage.Lobby && t.creator != address(0);
        if (!early && t.stage != Stage.Shuffling) revert WrongStage(Stage.Shuffling, t.stage);
        uint16 step = t.setupStep;
        if (step >= SETUP_STEPS) revert ShuffleNotDone();
        if (step < KryphoDeck.FILL_STEPS) {
            KryphoDeck.fillStep(_deck, id, uint8(step));
        } else {
            KryphoDeck.shuffleStep(_deck, id, step - KryphoDeck.FILL_STEPS, 0, KryphoDeck.DECK_SIZE);
        }
        t.setupStep = step + 1;
        emit ShuffleProgress(id, step + 1, SETUP_STEPS);
        if (step + 1 == SETUP_STEPS && !early) t.stage = Stage.Dealing;
    }

    function reshuffleStep(uint256 id) external {
        Table storage t = _requireStage(id, Stage.Playing);
        uint8 size = t.refillSize;
        if (size == 0) {
            uint256 spare = _discard[id].length - t.discardBase - 1;
            bool front = t.deckPtr >= KryphoDeck.DECK_SIZE - t.deckEnd;
            uint8 room = front ? t.deckPtr : KryphoDeck.DECK_SIZE - t.deckEnd;
            size = uint8(spare < room ? spare : room);
            if (size == 0 || t.deckEnd - t.deckPtr > REFILL_AT || (size < MIN_REFILL && t.deckPtr < t.deckEnd)) revert ShuffleNotDone();
            while (size & (size - 1) != 0) size &= size - 1;
            t.refillSize = size;
            t.refillAt = front ? 0 : t.deckEnd;
            t.refillFrom = t.discardBase;
            t.discardBase += size;
        }
        uint8 step = t.refillStep;
        uint8 fills = KryphoDeck.fillSteps(size);
        if (step >= fills + KryphoDeck.SHUFFLE_STEPS) revert ShuffleNotDone();
        if (step < fills) {
            KryphoDeck.refillStep(_deck, _discard, id, step, t.refillFrom, t.refillAt, size);
        } else {
            KryphoDeck.shuffleStep(_deck, id, step - fills, t.refillAt, size);
        }
        t.refillStep = step + 1;
        emit ShuffleProgress(id, step + 1, fills + KryphoDeck.SHUFFLE_STEPS);
        if (t.deckPtr >= t.deckEnd) _swapRefill(id, t);
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
        euint8 secret = FHE.rem(FHE.randEuint8(), SECRET_COLORS);
        _secret[id][seat] = secret;
        FHE.allowThis(secret);
        FHE.allow(secret, s.session);
        t.dealtMask |= uint8(1) << seat;
        if (t.dealtMask == (uint8(1) << t.joined) - 1) {
            t.deckPtr = HAND_START * t.joined;
            _exposeStarters(id, t);
        }
    }

    function setStarter(uint256 id, bytes calldata cleartexts, bytes calldata proof) external {
        Table storage t = _requireStage(id, Stage.Dealing);
        if (t.dealtMask != (uint8(1) << t.joined) - 1) revert NotDealt();
        bytes32[] memory handles = _starterHandles(id, t);
        FHE.checkSignatures(handles, cleartexts, proof);
        for (uint256 k = 0; k < handles.length; k++) {
            uint8 card = uint8(uint256(bytes32(cleartexts[k * 32:(k + 1) * 32])));
            t.deckPtr++;
            _discard[id].push(card);
            if (card.isNumber()) {
                t.topCard = card;
                t.color = card.colorOf();
                t.stage = Stage.Playing;
                t.turn = uint8(t.round % t.joined);
                _refreshDeadline(t);
                emit Dealt(id, t.round, t.turn, card);
                return;
            }
        }
        _exposeStarters(id, t);
    }

    function starterHandles(uint256 id) external view returns (bytes32[] memory) {
        return _starterHandles(id, _tables[id]);
    }

    function _starterHandles(uint256 id, Table storage t) internal view returns (bytes32[] memory handles) {
        uint256 left = KryphoDeck.DECK_SIZE - t.deckPtr;
        uint256 n = left < STARTER_BATCH ? left : STARTER_BATCH;
        handles = new bytes32[](n);
        for (uint256 k = 0; k < n; k++) handles[k] = FHE.toBytes32(_deck[id][t.deckPtr + k]);
    }

    function _exposeStarters(uint256 id, Table storage t) internal {
        for (uint256 k = 0; k < STARTER_BATCH && t.deckPtr + k < KryphoDeck.DECK_SIZE; k++) {
            FHE.makePubliclyDecryptable(_deck[id][t.deckPtr + k]);
        }
    }

    function play(uint256 id, uint8 slot, uint8 card, uint8 chosenColor, bytes32 seenHandle) public {
        Table storage t = _requireStage(id, Stage.Playing);
        if (t.drawFourBy != NONE) revert DrawFourPending();
        uint8 seat = _requireTurn(id, t);
        if (t.pendingDraw > 0 && !card.isDrawTwo()) revert MustStackOrTake();
        Seat storage s = _takeFromHand(id, t, seat, slot, seenHandle);
        if (!card.isValid()) revert BadCard();
        if (!card.matches(t.topCard, t.color)) revert IllegalCard();
        if (card.isWild() && chosenColor >= CardLib.WILD_COLOR) revert BadColor();
        if (card.isSpyglass()) _peek(id, t, seat, chosenColor);

        _honest[id][seat] = FHE.and(_honest[id][seat], FHE.eq(_hands[id][seat][slot], card));
        FHE.allowThis(_honest[id][seat]);
        uint8 prevColor = t.color;
        if (card == CardLib.WILD_DRAW_FOUR) _recordHadColor(id, seat, slot, prevColor);

        _layDown(t, s, slot, _discard[id], card);
        t.color = card.isWild() ? chosenColor : card.colorOf();
        emit Played(id, seat, slot, card, t.color);

        if (s.handSize == 0) {
            if (card.isDrawTwo()) _drawInto(id, t, _seatAt(t, 1), t.pendingDraw + 2);
            if (card == CardLib.WILD_DRAW_FOUR) _drawInto(id, t, _seatAt(t, 1), 4);
            t.pendingDraw = 0;
            _beginReveal(id, t, seat);
            return;
        }
        _openMono(t, s, seat);
        _applyEffect(id, t, card, seat, prevColor);
    }

    function veil(uint256 id, uint8 slot, uint8 claim, bytes32 seenHandle) public {
        Table storage t = _requireStage(id, Stage.Playing);
        if (t.drawFourBy != NONE || t.pendingDraw > 0) revert DrawPending();
        uint8 seat = _requireTurn(id, t);
        Seat storage s = _takeFromHand(id, t, seat, slot, seenHandle);
        if (s.veilUsed || s.handSize < 2) revert VeilUsed();
        if (!claim.isNumber() || claim.colorOf() >= CardLib.WILD_COLOR) revert BadCard();
        if (!claim.matches(t.topCard, t.color)) revert IllegalCard();
        ebool truth = FHE.eq(_hands[id][seat][slot], claim);
        _hadColor[id] = truth;
        FHE.allowThis(truth);
        s.veilUsed = true;
        _layDown(t, s, slot, _discard[id], claim);
        t.color = claim.colorOf();
        emit Veiled(id, seat, slot, claim);
        _openMono(t, s, seat);
        _advance(t, 1);
        t.veilBy = seat;
        t.veilJudge = t.turn;
    }

    function doubtVeil(uint256 id) public {
        Table storage t = _requireStage(id, Stage.Playing);
        uint8 seat = t.turn;
        if (!_isActor(id, seat)) revert NotYourTurn();
        if (t.veilJudge != seat || t.drawnSlot != NONE) revert NoVeil();
        t.monoWindow = NONE;
        _seats[id][seat].timeouts = 0;
        t.stage = Stage.AwaitChallenge;
        FHE.makePubliclyDecryptable(_hadColor[id]);
        emit VeilDoubted(id, seat);
    }

    function sonar(uint256 id, uint8 target, uint8 color) public {
        Table storage t = _requireStage(id, Stage.Playing);
        if (t.drawFourBy != NONE || t.pendingDraw > 0 || t.drawnSlot != NONE) revert DrawPending();
        uint8 seat = _requireTurn(id, t);
        Seat storage s = _seats[id][seat];
        if (s.sonarUsed || target == seat || target >= t.joined || color >= CardLib.WILD_COLOR) revert BadSonar();
        s.sonarUsed = true;
        s.timeouts = 0;
        t.monoWindow = NONE;
        _sonar[id][seat] = KryphoRadio.ping(_handColors, id, target, _seats[id][target].slots, color, s.session);
        emit Sonared(id, seat, target, color);
        _advance(t, 1);
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
        t.stage = Stage.Playing;
        if (t.veilBy != NONE) {
            emit VeilResolved(id, hadColor);
            _drawInto(id, t, hadColor ? t.veilJudge : t.veilBy, hadColor ? VEIL_TRUE_DRAW : VEIL_LIE_DRAW);
            _closeVeil(t);
            _refreshDeadline(t);
            return;
        }
        emit ChallengeResolved(id, hadColor);
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
        if (t.veilJudge == seat) _closeVeil(t);
        emit TimedOut(id, seat);
        s.timeouts++;
        if (s.timeouts >= MAX_TIMEOUTS && !s.abandoned) {
            s.abandoned = true;
            emit SeatAbandoned(id, seat);
            if (TAKEOVER != address(0)) _handOver(id, s, seat);
        }
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
        _advance(t, 1);
    }

    function prepareReveal(uint256 id) external {
        Table storage t = _requireStage(id, Stage.Revealing);
        uint8 seat = t.revealPrepared;
        if (seat >= t.joined) revert RevealNotReady();
        KryphoScore.expose(_revealHandles[id], _honest[id][seat], _secret[id][seat], _hands, id, seat, _seats[id][seat].slots);
        t.revealPrepared = seat + 1;
    }

    function finishReveal(uint256 id, bytes calldata cleartexts, bytes calldata proof) external {
        Table storage t = _requireStage(id, Stage.Revealing);
        if (t.revealPrepared != t.joined) revert RevealNotReady();
        FHE.checkSignatures(_revealHandles[id], cleartexts, proof);
        (int8 winner, bool over) = KryphoScore.settle(_seats, id, cleartexts, t.joined, t.candidate, t.topCard, t.config.singleRound, t.config.targetScore);
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

    function secretOf(uint256 id, uint8 seat) external view returns (euint8) {
        return _secret[id][seat];
    }

    function sonarOf(uint256 id, uint8 seat) external view returns (euint8) {
        return _sonar[id][seat];
    }

    function hadColorOf(uint256 id) external view returns (ebool) {
        return _hadColor[id];
    }

    function discardOf(uint256 id) external view returns (uint8[] memory cards) {
        uint8[] storage all = _discard[id];
        uint256 base = _tables[id].discardBase;
        cards = new uint8[](all.length - base);
        for (uint256 i = 0; i < cards.length; i++) cards[i] = all[base + i];
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
        return msg.sender == _seats[id][seat].session;
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
        address signer = KryphoRadio.signer(DOMAIN_SEPARATOR, id, a);
        if (signer == address(0)) revert BadSignature();
        return signer;
    }

    function _isOtherSeat(uint256 id, Table storage t, uint8 target) internal view returns (bool) {
        for (uint8 seat = 0; seat < t.joined; seat++) {
            if (seat != target && _isActor(id, seat)) return true;
        }
        return false;
    }

    function _requireTurn(uint256 id, Table storage t) internal returns (uint8) {
        if (!_isActor(id, t.turn)) revert NotYourTurn();
        if (t.veilJudge == t.turn) _closeVeil(t);
        return t.turn;
    }

    function _closeVeil(Table storage t) internal {
        t.veilBy = NONE;
        t.veilJudge = NONE;
    }

    function _takeFromHand(uint256 id, Table storage t, uint8 seat, uint8 slot, bytes32 seenHandle) internal view returns (Seat storage s) {
        s = _seats[id][seat];
        if (slot >= HAND_SLOTS || s.slots & (uint32(1) << slot) == 0) revert BadSlot();
        if (FHE.toBytes32(_hands[id][seat][slot]) != seenHandle) revert StaleHand();
        if (t.drawnSlot != NONE && slot != t.drawnSlot) revert MustPlayDrawnCard();
    }

    function _layDown(Table storage t, Seat storage s, uint8 slot, uint8[] storage pile, uint8 card) internal {
        s.slots &= ~(uint32(1) << slot);
        s.handSize--;
        pile.push(card);
        t.topCard = card;
        t.monoWindow = NONE;
        t.drawnSlot = NONE;
        s.timeouts = 0;
    }

    function _openMono(Table storage t, Seat storage s, uint8 seat) internal {
        if (s.handSize == 1 && !s.saidMono) {
            t.monoWindow = seat;
            t.monoBlock = uint64(block.number);
        }
    }

    function _peek(uint256 id, Table storage t, uint8 seat, uint8 target) internal {
        uint8 other = target >> 5;
        uint8 slot = target & 31;
        if (other == seat || other >= t.joined || slot >= HAND_SLOTS || _seats[id][other].slots & (uint32(1) << slot) == 0) revert BadPeek();
        FHE.allow(_hands[id][other][slot], _seats[id][seat].session);
        emit Peeked(id, seat, other, slot);
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
        return (t.deckPtr < t.deckEnd || _refillReady(t)) && _seats[id][seat].slots != (uint32(1) << HAND_SLOTS) - 1;
    }

    function _refillReady(Table storage t) internal view returns (bool) {
        return t.refillSize > 0 && t.refillStep == KryphoDeck.fillSteps(t.refillSize) + KryphoDeck.SHUFFLE_STEPS;
    }

    function _swapRefill(uint256 id, Table storage t) internal returns (bool) {
        if (!_refillReady(t)) return false;
        t.deckPtr = t.refillAt;
        t.deckEnd = t.refillAt + t.refillSize;
        emit Reshuffled(id, t.refillSize);
        t.refillSize = 0;
        t.refillStep = 0;
        return true;
    }

    function _handOver(uint256 id, Seat storage s, uint8 seat) internal {
        s.session = TAKEOVER;
        for (uint8 i = 0; i < HAND_SLOTS; i++) {
            if (s.slots & (uint32(1) << i) != 0) FHE.allow(_hands[id][seat][i], TAKEOVER);
        }
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
            if (t.deckPtr >= t.deckEnd && !_swapRefill(id, t)) break;
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
        _hadColor[id] = KryphoRadio.hadColor(_handColors, id, seat, _seats[id][seat].slots & ~(uint32(1) << slot), prevColor);
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
        _closeVeil(t);
        t.drawnSlot = NONE;
        t.monoWindow = NONE;
        t.revealPrepared = 0;
        emit RevealStarted(id, candidate);
    }

    function _resetRound(uint256 id, Table storage t) internal {
        t.stage = Stage.Shuffling;
        t.setupStep = 0;
        t.dealtMask = 0;
        t.deckPtr = 0;
        t.deckEnd = KryphoDeck.DECK_SIZE;
        t.refillSize = 0;
        t.refillStep = 0;
        t.discardBase = 0;
        t.dir = 1;
        t.drawnSlot = NONE;
        t.pendingDraw = 0;
        t.monoWindow = NONE;
        t.drawFourBy = NONE;
        _closeVeil(t);
        t.candidate = NONE;
        delete _discard[id];
        delete _revealHandles[id];
        KryphoLobby.resetSeats(_seats, id, t.joined);
    }
}
