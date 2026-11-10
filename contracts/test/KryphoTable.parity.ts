import { expect } from "chai";
import { network } from "hardhat";
import {
  type GameState,
  type Move,
  type Stage,
  applyCatch,
  applyChallenge,
  applyMove,
  applyReveal,
  applyTimeout,
  botCatchTarget,
  chooseMove,
  initialState,
} from "@kryphochroma/rules";

type Connection = Awaited<ReturnType<typeof network.connect>>;
type Signer = Awaited<ReturnType<Connection["ethers"]["getSigners"]>>[number];

let ethers: Connection["ethers"];
let fhevm: Connection["fhevm"];
let networkHelpers: Connection["networkHelpers"];

const NONE = 255;
const STAGES: Stage[] = ["Playing", "AwaitChallenge", "Revealing", "RoundOver", "MatchOver"];
const STAGE_INDEX: Record<Stage, number> = { Playing: 3, AwaitChallenge: 4, Revealing: 5, RoundOver: 6, MatchOver: 7 };
const hex = (value: string): `0x${string}` => value as `0x${string}`;

interface GameSetup {
  readonly seats: number;
  readonly stack: boolean;
  readonly cheaters: readonly number[];
  readonly timeoutEvery: number;
}

async function deployTable() {
  const table = await ethers.deployContract("KryphoTable");
  return table;
}

async function openTable(table: Awaited<ReturnType<typeof deployTable>>, players: Signer[], stack: boolean) {
  const [creator] = players;
  if (!creator) throw new Error("no creator");
  await (await table.connect(creator).createTable({ seats: players.length, turnTimeout: 90, targetScore: 500, singleRound: true, stackDrawTwo: stack })).wait();
  const id = await table.tableCount();
  for (const p of players) await (await table.connect(p).join(id, p.address)).wait();
  await (await table.connect(creator).start(id)).wait();
  for (let step = 0; step < 60; step++) await (await table.setupStep(id, { gasLimit: 16_700_000 })).wait();
  for (let seat = 0; seat < players.length; seat++) await (await table.dealSeat(id, seat)).wait();
  const deck: number[] = [];
  for (let i = 0; i < 108; i++) deck.push(await fhevm.cleartextDb.readUint8({ euint8: hex(await table.deckCardAt(id, i)) }));
  while (Number((await table.getTable(id)).stage) === 2) {
    const ptr = Number((await table.getTable(id)).deckPtr);
    const { checkSignaturesArgs } = await fhevm.helpers.decryptPublicUint8WithSignatures({ euint8: hex(await table.deckCardAt(id, ptr)) });
    await (await table.setStarter(id, checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof)).wait();
  }
  return { id, deck };
}

async function compare(table: Awaited<ReturnType<typeof deployTable>>, id: bigint, state: GameState, label: string) {
  const t = await table.getTable(id);
  const pub = state.pub;
  const onChain = {
    stage: Number(t.stage),
    turn: Number(t.turn),
    dir: Number(t.dir),
    topCard: Number(t.topCard),
    color: Number(t.color),
    deckCount: 108 - Number(t.deckPtr),
    drawnSlot: Number(t.drawnSlot),
    pendingDraw: Number(t.pendingDraw),
    monoWindow: Number(t.monoWindow),
    drawFourBy: Number(t.drawFourBy),
    discard: (await table.discardOf(id)).map(Number),
    seats: [] as unknown[],
  };
  const expected = {
    stage: STAGE_INDEX[pub.stage],
    turn: pub.turn,
    dir: pub.dir,
    topCard: pub.topCard,
    color: pub.color,
    deckCount: pub.deckCount,
    drawnSlot: pub.drawnSlot ?? NONE,
    pendingDraw: pub.pendingDraw,
    monoWindow: pub.monoWindow ?? NONE,
    drawFourBy: pub.drawFour?.by ?? NONE,
    discard: [...pub.discard],
    seats: [] as unknown[],
  };
  for (let seat = 0; seat < pub.config.seats; seat++) {
    const s = await table.getSeat(id, seat);
    const e = pub.seats[seat];
    if (!e) throw new Error("seat missing");
    onChain.seats.push({ handSize: Number(s.handSize), slots: Number(s.slots), saidMono: s.saidMono, timeouts: Number(s.timeouts), abandoned: s.abandoned, score: Number(s.score) });
    const mask = e.slots.reduce((m, used, i) => (used ? m | (1 << i) : m), 0);
    expected.seats.push({ handSize: e.handSize, slots: mask, saidMono: e.saidMono, timeouts: e.timeouts, abandoned: e.abandoned, score: e.score });
  }
  expect(onChain, label).to.deep.equal(expected);
}

async function send(table: Awaited<ReturnType<typeof deployTable>>, id: bigint, signer: Signer, seat: number, move: Move) {
  const c = table.connect(signer);
  switch (move.type) {
    case "play":
      return (await c.play(id, move.slot, move.card, move.color ?? 0, (await table.handOf(id, seat))[move.slot]!)).wait();
    case "draw":
      return (await c.draw(id)).wait();
    case "pass":
      return (await c.pass(id)).wait();
    case "take":
      return (await c.takeDraws(id)).wait();
    case "mono":
      return (await c.sayMono(id, seat)).wait();
    case "accept":
      return (await c.acceptDrawFour(id)).wait();
    case "challenge":
      return (await c.challengeDrawFour(id)).wait();
  }
}

async function playGame(setup: GameSetup, players: Signer[]): Promise<{ steps: number; finished: boolean; state: GameState }> {
  const table = await deployTable();
  const { id, deck } = await openTable(table, players, setup.stack);
  let state = initialState({ seats: setup.seats, mode: "single", targetScore: 500, stackDrawTwo: setup.stack }, 1, deck).state;
  await compare(table, id, state, "after deal");
  let steps = 0;
  while (steps < 400) {
    steps++;
    const stage = state.pub.stage;
    if (stage === "AwaitChallenge") {
      const { clearValue, checkSignaturesArgs } = await fhevm.helpers.decryptPublicBoolWithSignatures({ ebool: hex(await table.hadColorOf(id)) });
      expect(clearValue).to.equal(state.hadColor);
      await (await table.resolveChallenge(id, checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof)).wait();
      state = applyChallenge(state).state;
    } else if (stage === "Revealing") {
      for (let seat = 0; seat < setup.seats; seat++) await (await table.prepareReveal(id)).wait();
      const handles = (await table.revealHandles(id)).map(hex);
      const { checkSignaturesArgs } = await fhevm.client.decryptPublicValuesWithSignatures({ encryptedValues: handles });
      await (await table.finishReveal(id, checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof)).wait();
      state = applyReveal(state).state;
      await compare(table, id, state, `step ${steps} reveal`);
      return { steps, finished: true, state };
    } else {
      const turn = state.pub.turn;
      const catcher = botCatchTarget(state.pub, (turn + 1) % setup.seats);
      const actor = players[turn];
      if (!actor) throw new Error("no actor");
      if (catcher !== null && steps % 2 === 0) {
        const next = applyCatch(state, catcher);
        if (next.events.some((e) => e.type === "Reshuffled")) return { steps, finished: false, state };
        const catcherSigner = players[(catcher + 1) % setup.seats];
        if (!catcherSigner) throw new Error("no catcher");
        await networkHelpers.mine();
        await (await table.connect(catcherSigner).catchMono(id, catcher)).wait();
        state = next.state;
      } else if (setup.timeoutEvery > 0 && steps % setup.timeoutEvery === 0) {
        const next = applyTimeout(state);
        if (next.events.some((e) => e.type === "Reshuffled")) return { steps, finished: false, state };
        await networkHelpers.time.increase(91);
        await (await table.forceTimeout(id)).wait();
        state = next.state;
      } else {
        const move = chooseMove(state.pub, turn, state.hands[turn] ?? [], { cheat: setup.cheaters.includes(turn) });
        if (!move) throw new Error("no move");
        const next = applyMove(state, turn, move);
        if (next.events.some((e) => e.type === "Reshuffled")) return { steps, finished: false, state };
        await send(table, id, actor, turn, move);
        state = next.state;
      }
    }
    await compare(table, id, state, `step ${steps}`);
    expect(STAGES).to.include(state.pub.stage);
  }
  return { steps, finished: false, state };
}

describe("KryphoTable parity with the rules engine", function () {
  let signers: Signer[];

  before(async function () {
    ({ ethers, fhevm, networkHelpers } = await network.connect());
    signers = await ethers.getSigners();
  });

  it("2 seats, official draw two", async function () {
    const result = await playGame({ seats: 2, stack: false, cheaters: [], timeoutEvery: 0 }, signers.slice(0, 2));
    expect(result.finished).to.equal(true);
    expect(result.steps).to.be.greaterThan(10);
    expect(result.state.pub.stage).to.equal("MatchOver");
    expect(result.state.pub.lastResult?.cheaters).to.deep.equal([]);
  });

  it("3 seats, stacked draw two and timeouts", async function () {
    const result = await playGame({ seats: 3, stack: true, cheaters: [], timeoutEvery: 17 }, signers.slice(0, 3));
    expect(result.finished).to.equal(true);
    expect(result.steps).to.be.greaterThan(10);
  });

  it("a lying seat is caught at reveal and pays the penalty", async function () {
    let caught = false;
    for (let game = 0; game < 6 && !caught; game++) {
      const result = await playGame({ seats: 4, stack: false, cheaters: [0], timeoutEvery: 0 }, signers.slice(0, 4));
      if (!result.finished || result.state.honest[0] !== false) continue;
      expect(result.state.pub.lastResult?.cheaters).to.deep.equal([0]);
      expect(result.state.pub.lastResult?.winner).to.not.equal(0);
      caught = true;
    }
    expect(caught).to.equal(true);
  });

  it("random tables of 2 to 4 seats stay in sync", async function () {
    let finished = 0;
    for (let game = 0; game < 6; game++) {
      const seats = 2 + (game % 3);
      const result = await playGame({ seats, stack: game % 2 === 1, cheaters: game === 5 ? [1] : [], timeoutEvery: game === 4 ? 9 : 0 }, signers.slice(0, seats));
      if (result.finished) finished++;
    }
    expect(finished).to.be.greaterThanOrEqual(5);
  });
});
