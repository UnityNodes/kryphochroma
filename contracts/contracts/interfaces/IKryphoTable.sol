// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

interface IKryphoTable {
    enum Stage {
        Lobby,
        Shuffling,
        Dealing,
        Playing,
        AwaitChallenge,
        Revealing,
        RoundOver,
        MatchOver
    }

    struct Config {
        uint8 seats;
        uint32 turnTimeout;
        uint16 targetScore;
        bool singleRound;
        bool stackDrawTwo;
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
        bool veilUsed;
        bool sonarUsed;
    }

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

    error BadConfig();
    error TableFull();
    error AlreadySeated();
    error NotCreator();
    error NotSeated();
    error WrongStage(Stage expected, Stage actual);
    error NotYourTurn();
    error BadSlot();
    error BadCard();
    error IllegalCard();
    error BadColor();
    error MustPlayDrawnCard();
    error AlreadyDrew();
    error CannotDraw();
    error CannotPass();
    error DrawFourPending();
    error DrawPending();
    error NoPendingDraw();
    error MustStackOrTake();
    error NoDrawFour();
    error CannotSayMono();
    error CannotCatch();
    error TurnNotExpired();
    error ShuffleNotDone();
    error BadSession();
    error TransferFailed();
    error CatchTooEarly();
    error RevealNotReady();
    error StaleHand();
    error BadAction();
    error BadSignature();
    error VeilUsed();
    error NoVeil();
    error BadPeek();
    error BadSonar();

    event TableCreated(uint256 indexed id, address indexed creator, Config config);
    event Joined(uint256 indexed id, uint8 seat, address indexed player, address session);
    event ShuffleProgress(uint256 indexed id, uint16 step, uint16 total);
    event Dealt(uint256 indexed id, uint16 round, uint8 firstSeat, uint8 topCard);
    event Played(uint256 indexed id, uint8 seat, uint8 slot, uint8 card, uint8 color);
    event Drew(uint256 indexed id, uint8 seat, uint8 slot);
    event Passed(uint256 indexed id, uint8 seat);
    event MonoSaid(uint256 indexed id, uint8 seat);
    event MonoCaught(uint256 indexed id, uint8 seat);
    event DrawFourAccepted(uint256 indexed id, uint8 seat);
    event DrawsTaken(uint256 indexed id, uint8 seat, uint8 count);
    event DrawFourChallenged(uint256 indexed id, uint8 seat);
    event ChallengeResolved(uint256 indexed id, bool hadColor);
    event Veiled(uint256 indexed id, uint8 seat, uint8 slot, uint8 claim);
    event VeilDoubted(uint256 indexed id, uint8 seat);
    event VeilResolved(uint256 indexed id, bool truth);
    event Peeked(uint256 indexed id, uint8 seat, uint8 target, uint8 slot);
    event Sonared(uint256 indexed id, uint8 seat, uint8 target, uint8 color);
    event TimedOut(uint256 indexed id, uint8 seat);
    event SeatAbandoned(uint256 indexed id, uint8 seat);
    event Reshuffled(uint256 indexed id, uint8 count);
    event RevealStarted(uint256 indexed id, uint8 candidate);
    event RoundSettled(uint256 indexed id, int8 winner, uint16 points, uint8 cheaters, bool bonus);
    event MatchOver(uint256 indexed id, int8 winner);
    event TableCancelled(uint256 indexed id);
    event Left(uint256 indexed id, uint8 seat, address indexed player);
    event ActionRelayed(uint256 indexed id, uint8 seat, uint32 nonce);
    event ActionRejected(uint256 indexed id, uint8 seat, uint32 nonce, bytes4 reason);
}
