import { expect } from "chai";
import { network } from "hardhat";
import { signAction } from "./KryphoTable.parity.js";
import { deployHarness, deployTable } from "./deploy.js";

type Connection = Awaited<ReturnType<typeof network.connect>>;
type Signer = Awaited<ReturnType<Connection["ethers"]["getSigners"]>>[number];

let ethers: Connection["ethers"];
let fhevm: Connection["fhevm"];
let networkHelpers: Connection["networkHelpers"];
const hex = (value: string): `0x${string}` => value as `0x${string}`;
const config = { seats: 2, turnTimeout: 90, targetScore: 500, singleRound: true, stackDrawTwo: false };

async function ready(players: Signer[], takeover = ethers.ZeroAddress) {
  const table = await deployHarness(ethers, takeover);
  const [creator] = players;
  if (!creator) throw new Error("no creator");
  await (await table.connect(creator).createTable({ ...config, seats: players.length })).wait();
  const id = await table.tableCount();
  for (const p of players) await (await table.connect(p).join(id, p.address)).wait();
  await (await table.connect(creator).start(id)).wait();
  for (let step = 0; step < 70; step++) await (await table.setupStep(id, { gasLimit: 16_700_000 })).wait();
  for (let seat = 0; seat < players.length; seat++) await (await table.dealSeat(id, seat)).wait();
  return { table, id };
}

async function starter(table: { starterHandles(id: bigint): Promise<string[]> }, id: bigint) {
  const handles = (await table.starterHandles(id)).map(hex);
  const { clearValues, checkSignaturesArgs } = await fhevm.client.decryptPublicValuesWithSignatures({ encryptedValues: handles });
  return { clearValue: Number((clearValues[0] as { value: unknown }).value), checkSignaturesArgs };
}

describe("KryphoTable guards", function () {
  let s: Signer[];

  before(async function () {
    ({ ethers, fhevm, networkHelpers } = await network.connect());
    s = await ethers.getSigners();
  });

  it("validates config and lobby rules", async function () {
    const table = await deployTable(ethers, ethers.ZeroAddress);
    expect((await ethers.provider.getCode(await table.getAddress())).length / 2 - 1).to.be.at.most(24_576);
    await expect(table.createTable({ ...config, seats: 1 })).to.be.revertedWithCustomError(table, "BadConfig");
    await expect(table.createTable({ ...config, seats: 5 })).to.be.revertedWithCustomError(table, "BadConfig");
    await expect(table.createTable({ ...config, turnTimeout: 5 })).to.be.revertedWithCustomError(table, "BadConfig");
    await expect(table.createTable({ ...config, targetScore: 0 })).to.be.revertedWithCustomError(table, "BadConfig");
    await expect(table.createTable({ ...config, targetScore: 10_001 })).to.be.revertedWithCustomError(table, "BadConfig");
    await expect(table.createTable({ ...config, turnTimeout: 86_401 })).to.be.revertedWithCustomError(table, "BadConfig");
    await (await table.createTable(config)).wait();
    const id = await table.tableCount();
    await expect(table.join(id, ethers.ZeroAddress)).to.be.revertedWithCustomError(table, "BadSession");
    await expect(table.start(id)).to.be.revertedWithCustomError(table, "BadConfig");
    await (await table.join(id, s[5]!.address, { value: ethers.parseEther("0.01") })).wait();
    expect(await ethers.provider.getBalance(s[5]!.address)).to.be.greaterThan(0n);
    await expect(table.join(id, s[6]!.address)).to.be.revertedWithCustomError(table, "AlreadySeated");
    await expect(table.connect(s[1]!).join(id, s[5]!.address)).to.be.revertedWithCustomError(table, "BadSession");
    await (await table.connect(s[1]!).join(id, s[1]!.address)).wait();
    await expect(table.connect(s[2]!).join(id, s[2]!.address)).to.be.revertedWithCustomError(table, "TableFull");
    await expect(table.connect(s[2]!).start(id)).to.be.revertedWithCustomError(table, "NotSeated");
    await expect(table.dealSeat(id, 0)).to.be.revertedWithCustomError(table, "WrongStage");
    await expect(table.dealSeat(999, 0)).to.be.revertedWithCustomError(table, "WrongStage");
  });

  it("deals only after the full shuffle and only once per seat", async function () {
    const table = await deployTable(ethers, ethers.ZeroAddress);
    await (await table.createTable(config)).wait();
    const id = await table.tableCount();
    await (await table.join(id, s[0]!.address)).wait();
    await (await table.connect(s[1]!).join(id, s[1]!.address)).wait();
    await (await table.start(id)).wait();
    await expect(table.dealSeat(id, 0)).to.be.revertedWithCustomError(table, "WrongStage");
    for (let step = 0; step < 70; step++) await (await table.setupStep(id, { gasLimit: 16_700_000 })).wait();
    await expect(table.setupStep(id)).to.be.revertedWithCustomError(table, "WrongStage");
    await (await table.dealSeat(id, 0)).wait();
    await expect(table.dealSeat(id, 0)).to.be.revertedWithCustomError(table, "BadSlot");
    await expect(table.dealSeat(id, 2)).to.be.revertedWithCustomError(table, "BadSlot");
    await expect(table.setStarter(id, "0x", "0x")).to.be.revertedWithCustomError(table, "NotDealt");
  });

  it("keeps hands private to their session", async function () {
    const { table, id } = await ready([s[0]!, s[1]!]);
    const address = await table.getAddress();
    const hand = await table.handOf(id, 0);
    const own = await fhevm.helpers.decryptUint8({ euint8: hex(hand[0]!), contractAddress: address, userAddress: s[0]!.address });
    expect(own).to.be.a("number");
    let denied = false;
    try {
      await fhevm.helpers.decryptUint8({ euint8: hex(hand[0]!), contractAddress: address, userAddress: s[1]!.address });
    } catch {
      denied = true;
    }
    expect(denied).to.equal(true);
  });

  it("rejects a forged starter and replays of the starter proof", async function () {
    const { table, id } = await ready([s[0]!, s[1]!]);
    const first = await starter(table, id);
    const real = first.checkSignaturesArgs.abiEncodedCleartexts;
    const forged = `${ethers.AbiCoder.defaultAbiCoder().encode(["uint8"], [(first.clearValue + 1) % 10])}${real.slice(66)}`;
    let forgedFailed = false;
    try {
      await (await table.setStarter(id, forged, first.checkSignaturesArgs.decryptionProof)).wait();
    } catch {
      forgedFailed = true;
    }
    expect(forgedFailed).to.equal(true);
    await (await table.setStarter(id, first.checkSignaturesArgs.abiEncodedCleartexts, first.checkSignaturesArgs.decryptionProof)).wait();
    let replayFailed = false;
    try {
      await (await table.setStarter(id, first.checkSignaturesArgs.abiEncodedCleartexts, first.checkSignaturesArgs.decryptionProof)).wait();
    } catch {
      replayFailed = true;
    }
    expect(replayFailed).to.equal(true);
  });

  it("enforces turn order, legality and timeouts", async function () {
    const { table, id } = await ready([s[0]!, s[1]!]);
    while (Number((await table.getTable(id)).stage) === 2) {
      const { checkSignaturesArgs } = await starter(table, id);
      await (await table.setStarter(id, checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof)).wait();
    }
    const t = await table.getTable(id);
    const turn = Number(t.turn);
    const other = s[1 - turn]!;
    const actor = s[turn]!;
    await expect(table.connect(other).draw(id)).to.be.revertedWithCustomError(table, "NotYourTurn");
    await expect(table.connect(s[7]!).draw(id)).to.be.revertedWithCustomError(table, "NotYourTurn");
    await expect(table.connect(actor).pass(id)).to.be.revertedWithCustomError(table, "CannotPass");
    await expect(table.connect(actor).takeDraws(id)).to.be.revertedWithCustomError(table, "NoPendingDraw");
    await expect(table.connect(actor).acceptDrawFour(id)).to.be.revertedWithCustomError(table, "NoDrawFour");
    const hand = await table.handOf(id, turn);
    const seen = hand[0]!;
    await expect(table.connect(actor).play(id, 30, 1, 0, seen)).to.be.revertedWithCustomError(table, "BadSlot");
    await expect(table.connect(actor).play(id, 0, 1, 0, hand[1]!)).to.be.revertedWithCustomError(table, "StaleHand");
    await expect(table.connect(actor).play(id, 0, 0x5f, 0, seen)).to.be.revertedWithCustomError(table, "BadCard");
    const top = Number(t.topCard);
    const offColor = ((top >> 4) + 1) % 4;
    const offRank = ((top & 15) + 1) % 10;
    await expect(table.connect(actor).play(id, 0, offColor * 16 + offRank, 0, seen)).to.be.revertedWithCustomError(table, "IllegalCard");
    await expect(table.connect(actor).play(id, 0, 0x5d, 5, seen)).to.be.revertedWithCustomError(table, "BadColor");
    await expect(table.forceTimeout(id)).to.be.revertedWithCustomError(table, "TurnNotExpired");
    await (await table.connect(actor).draw(id)).wait();
    await expect(table.connect(actor).draw(id)).to.be.revertedWithCustomError(table, "AlreadyDrew");
    await expect(table.connect(actor).play(id, 0, top, 0, seen)).to.be.revertedWithCustomError(table, "MustPlayDrawnCard");
    await expect(table.catchMono(id, 0)).to.be.revertedWithCustomError(table, "CannotCatch");
    await expect(table.connect(actor).sayMono(id, turn)).to.be.revertedWithCustomError(table, "CannotSayMono");
    await expect(table.connect(other).sayMono(id, turn)).to.be.revertedWithCustomError(table, "NotYourTurn");
    await networkHelpers.time.increase(91);
    await (await table.forceTimeout(id)).wait();
    expect(Number((await table.getTable(id)).turn)).to.equal(1 - turn);
    await expect(table.finishReveal(id, "0x", "0x")).to.be.revertedWithCustomError(table, "WrongStage");
    await expect(table.resolveChallenge(id, "0x", "0x")).to.be.revertedWithCustomError(table, "WrongStage");
    await expect(table.nextRound(id)).to.be.revertedWithCustomError(table, "WrongStage");
  });

  it("lets only the creator cancel a table in the lobby", async function () {
    const table = await deployTable(ethers, ethers.ZeroAddress);
    await (await table.createTable(config)).wait();
    const id = await table.tableCount();
    await expect(table.connect(s[1]!).cancel(id)).to.be.revertedWithCustomError(table, "NotCreator");
    await expect(table.cancel(id)).to.emit(table, "TableCancelled");
    await expect(table.join(id, s[0]!.address)).to.be.revertedWithCustomError(table, "WrongStage");
    await expect(table.cancel(id)).to.be.revertedWithCustomError(table, "WrongStage");
  });

  it("lets a player leave the lobby, hands the host role on and closes an empty table", async function () {
    const table = await deployTable(ethers, ethers.ZeroAddress);
    await (await table.connect(s[0]!).createTable({ ...config, seats: 3 })).wait();
    const id = await table.tableCount();
    for (const p of [s[0]!, s[1]!, s[2]!]) await (await table.connect(p).join(id, p.address)).wait();
    await expect(table.connect(s[3]!).leave(id)).to.be.revertedWithCustomError(table, "NotSeated");
    await expect(table.connect(s[1]!).leave(id)).to.emit(table, "Left").withArgs(id, 1, s[1]!.address);
    expect(Number((await table.getTable(id)).joined)).to.equal(2);
    expect((await table.getSeat(id, 1)).player).to.equal(s[2]!.address);
    await expect(table.connect(s[0]!).leave(id)).to.emit(table, "Left").withArgs(id, 0, s[0]!.address);
    expect((await table.getTable(id)).creator).to.equal(s[2]!.address);
    await (await table.connect(s[1]!).join(id, s[1]!.address)).wait();
    await expect(table.connect(s[1]!).start(id)).to.be.revertedWithCustomError(table, "NotCreator");
    await expect(table.connect(s[2]!).leave(id)).to.emit(table, "Left");
    await expect(table.connect(s[1]!).leave(id)).to.emit(table, "TableCancelled").withArgs(id);
    expect(Number((await table.getTable(id)).stage)).to.equal(7);
    await expect(table.connect(s[1]!).join(id, s[1]!.address)).to.be.revertedWithCustomError(table, "WrongStage");
  });

  it("lets anyone seated start a full table when the host is gone", async function () {
    const table = await deployTable(ethers, ethers.ZeroAddress);
    await (await table.connect(s[3]!).createTable(config)).wait();
    const id = await table.tableCount();
    await (await table.connect(s[0]!).join(id, s[0]!.address)).wait();
    await expect(table.connect(s[0]!).start(id)).to.be.revertedWithCustomError(table, "NotCreator");
    await (await table.connect(s[1]!).join(id, s[1]!.address)).wait();
    await expect(table.connect(s[2]!).start(id)).to.be.revertedWithCustomError(table, "NotSeated");
    await (await table.connect(s[1]!).start(id)).wait();
    expect(Number((await table.getTable(id)).stage)).to.equal(1);
  });

  it("needs every seat prepared before the final reveal", async function () {
    const table = await deployTable(ethers, ethers.ZeroAddress);
    await (await table.createTable(config)).wait();
    const id = await table.tableCount();
    await expect(table.prepareReveal(id)).to.be.revertedWithCustomError(table, "WrongStage");
  });

  it("relays only correctly signed, in-order actions and survives a bad one", async function () {
    const { table, id } = await ready([s[0]!, s[1]!]);
    while (Number((await table.getTable(id)).stage) === 2) {
      const { checkSignaturesArgs } = await starter(table, id);
      await (await table.setStarter(id, checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof)).wait();
    }
    const turn = Number((await table.getTable(id)).turn);
    const actor = s[turn]!;
    const other = s[1 - turn]!;
    const forged = await signAction(table, other, id, turn, 1, {}, 0);
    await expect(table.relay(id, [forged])).to.be.revertedWithCustomError(table, "BadSignature");
    const wrongNonce = await signAction(table, actor, id, turn, 1, {}, 5);
    const skipped = await (await table.relay(id, [wrongNonce])).wait();
    expect(skipped!.logs).to.have.length(0);
    expect((await table.noncesOf(id))[turn]).to.equal(0n);
    const badPass = await signAction(table, actor, id, turn, 2, {}, 0);
    const draw = await signAction(table, actor, id, turn, 1, {}, 1);
    const receipt = await (await table.relay(id, [badPass, draw])).wait();
    const names = receipt!.logs.map((l) => { try { return table.interface.parseLog(l)?.name; } catch { return null; } });
    expect(names).to.include("ActionRejected");
    expect(names).to.include("ActionRelayed");
    expect(names).to.include("Drew");
    expect((await table.noncesOf(id))[turn]).to.equal(2n);
    expect((await (await table.relay(id, [draw])).wait())!.logs).to.have.length(0);
    await expect(table.relayOne(id, draw)).to.be.revertedWithCustomError(table, "NotYourTurn");
    await (await table.relay(id, [await signAction(table, actor, id, turn, 2, {}, 2)])).wait();
    const starved = await signAction(table, other, id, 1 - turn, 1, {}, 0);
    const needed = await table.relay.estimateGas(id, [starved]);
    await expect(table.relay(id, [starved], { gasLimit: (needed * 7n) / 10n })).to.be.revert(ethers);
    expect((await table.noncesOf(id))[1 - turn]).to.equal(0n);
    await (await table.relay(id, [starved])).wait();
    expect((await table.noncesOf(id))[1 - turn]).to.equal(1n);
  });

  it("pre-shuffles in the lobby and deals right after start", async function () {
    const table = await deployTable(ethers, ethers.ZeroAddress);
    await (await table.createTable(config)).wait();
    const id = await table.tableCount();
    for (let step = 0; step < 70; step++) await (await table.setupStep(id, { gasLimit: 16_700_000 })).wait();
    await expect(table.setupStep(id)).to.be.revertedWithCustomError(table, "ShuffleNotDone");
    expect(Number((await table.getTable(id)).stage)).to.equal(0);
    await (await table.join(id, s[0]!.address)).wait();
    await (await table.connect(s[1]!).join(id, s[1]!.address)).wait();
    await (await table.start(id)).wait();
    const t = await table.getTable(id);
    expect(Number(t.stage)).to.equal(2);
    expect(Number(t.setupStep)).to.equal(70);
    await (await table.dealSeat(id, 0)).wait();
    await (await table.dealSeat(id, 1)).wait();
    const { checkSignaturesArgs } = await starter(table, id);
    await (await table.setStarter(id, checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof)).wait();
    expect(Number((await table.getTable(id)).stage)).to.be.oneOf([2, 3]);
  });
  it("hands an abandoned seat and its sealed cards to the takeover bot", async function () {
    const takeover = s[9]!;
    const { table, id } = await ready([s[0]!, s[1]!], takeover.address);
    while (Number((await table.getTable(id)).stage) === 2) {
      const { checkSignaturesArgs } = await starter(table, id);
      await (await table.setStarter(id, checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof)).wait();
    }
    const first = Number((await table.getTable(id)).turn);
    for (let k = 0; k < 5; k++) {
      await networkHelpers.time.increase(91);
      await (await table.forceTimeout(id)).wait();
    }
    const seat = await table.getSeat(id, first);
    expect(seat.abandoned).to.equal(true);
    expect(seat.session).to.equal(takeover.address);
    expect((await table.getSeat(id, 1 - first)).session).to.equal(s[1 - first]!.address);
    const hand = await table.handOf(id, first);
    const address = await table.getAddress();
    const card = await fhevm.helpers.decryptUint8({ euint8: hex(hand[0]!), contractAddress: address, userAddress: takeover.address });
    expect(card).to.be.lessThan(0x5f);
    const forced = await fhevm.helpers.decryptUint8({ euint8: hex(hand[9]!), contractAddress: address, userAddress: takeover.address });
    expect(forced).to.be.lessThan(0x5f);
    let denied = false;
    try {
      await fhevm.helpers.decryptUint8({ euint8: hex(hand[9]!), contractAddress: address, userAddress: s[first]!.address });
    } catch {
      denied = true;
    }
    expect(denied, "old session must not see the card drawn on the abandoning timeout").to.equal(true);
    expect(Number((await table.getTable(id)).turn)).to.equal(1 - first);
    await (await table.connect(s[1 - first]!).draw(id)).wait();
    await (await table.connect(s[1 - first]!).pass(id)).wait();
    await (await table.connect(takeover).draw(id)).wait();
    await (await table.connect(takeover).pass(id)).wait();
    expect((await table.getSeat(id, first)).timeouts).to.equal(0n);
    await networkHelpers.time.increase(91);
    await (await table.forceTimeout(id)).wait();
    await expect(table.connect(s[first]!).draw(id)).to.be.revertedWithCustomError(table, "NotYourTurn");
  });

  it("refills the deck from the discard in the background and swaps it in when the deck runs out", async function () {
    const { table, id } = await ready([s[0]!, s[1]!]);
    while (Number((await table.getTable(id)).stage) === 2) {
      const { checkSignaturesArgs } = await starter(table, id);
      await (await table.setStarter(id, checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof)).wait();
    }
    await expect(table.reshuffleStep(id)).to.be.revertedWithCustomError(table, "ShuffleNotDone");
    await (await table.stageDeck(id, 100, [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08])).wait();
    await expect(table.reshuffleStep(id)).to.be.revertedWithCustomError(table, "ShuffleNotDone");
    const below = [0x01, 0x02, 0x13, 0x24, 0x35, 0x0a, 0x1b, 0x2c, 0x5d, 0x5e, 0x07, 0x18, 0x29, 0x31, 0x05, 0x16, 0x27, 0x38, 0x09, 0x33];
    const top = Number((await table.getTable(id)).topCard);
    await (await table.stageDeck(id, 100, below)).wait();
    await (await table.reshuffleStep(id)).wait();
    const size = 16;
    expect((await table.discardOf(id)).map(Number)).to.deep.equal([...below.slice(size), top]);
    for (let step = 1; step < 65; step++) await (await table.reshuffleStep(id, { gasLimit: 16_700_000 })).wait();
    await expect(table.reshuffleStep(id)).to.be.revertedWithCustomError(table, "ShuffleNotDone");
    const refilled: number[] = [];
    for (let i = 0; i < size; i++) refilled.push(await fhevm.cleartextDb.readUint8({ euint8: hex(await table.deckCardAt(id, i)) }));
    expect([...refilled].sort()).to.deep.equal(below.slice(0, size).sort());
    expect(refilled).to.not.deep.equal(below.slice(0, size));
    let t = await table.getTable(id);
    expect(Number(t.deckPtr)).to.equal(100);
    await (await table.stageDeck(id, 138, [])).wait();
    const turn = Number(t.turn);
    await expect(table.connect(s[turn]!).draw(id)).to.emit(table, "Reshuffled").withArgs(id, size);
    t = await table.getTable(id);
    expect([Number(t.deckPtr), Number(t.deckEnd), Number(t.refillSize)]).to.deep.equal([1, size, 0]);
    const slot = Number(t.drawnSlot);
    const drawn = await fhevm.cleartextDb.readUint8({ euint8: hex((await table.handOf(id, turn))[slot]!) });
    expect(drawn).to.equal(refilled[0]);
  });
  it("lets a spyglass read exactly one opponent card and keeps secret colours private", async function () {
    const { table, id } = await ready([s[0]!, s[1]!]);
    while (Number((await table.getTable(id)).stage) === 2) {
      const { checkSignaturesArgs } = await starter(table, id);
      await (await table.setStarter(id, checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof)).wait();
    }
    const address = await table.getAddress();
    const canRead = async (handle: string, user: string) => {
      try {
        await fhevm.helpers.decryptUint8({ euint8: hex(handle), contractAddress: address, userAddress: user });
        return true;
      } catch {
        return false;
      }
    };
    const secret = await table.secretOf(id, 0);
    expect(await fhevm.helpers.decryptUint8({ euint8: hex(secret), contractAddress: address, userAddress: s[0]!.address })).to.be.lessThan(5);
    expect(await canRead(secret, s[1]!.address)).to.equal(false);

    const t = await table.getTable(id);
    const turn = Number(t.turn);
    const other = 1 - turn;
    const spyglass = Number(t.color) * 16 + 13;
    await (await table.setHandCard(id, turn, 0, spyglass)).wait();
    const seen = (await table.handOf(id, turn))[0]!;
    await expect(table.connect(s[turn]!).play(id, 0, spyglass, turn * 32 + 1, seen)).to.be.revertedWithCustomError(table, "BadPeek");
    await expect(table.connect(s[turn]!).play(id, 0, spyglass, other * 32 + 20, seen)).to.be.revertedWithCustomError(table, "BadPeek");
    await expect(table.connect(s[turn]!).play(id, 0, spyglass, other * 32 + 3, seen)).to.emit(table, "Peeked").withArgs(id, turn, other, 3);
    const target = await table.handOf(id, other);
    expect(await canRead(target[3]!, s[turn]!.address)).to.equal(true);
    expect(await canRead(target[4]!, s[turn]!.address)).to.equal(false);
  });

  it("answers a sonar ping with an encrypted count only the asker can read, once per round", async function () {
    const { table, id } = await ready([s[0]!, s[1]!]);
    while (Number((await table.getTable(id)).stage) === 2) {
      const { checkSignaturesArgs } = await starter(table, id);
      await (await table.setStarter(id, checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof)).wait();
    }
    const address = await table.getAddress();
    const t = await table.getTable(id);
    const turn = Number(t.turn);
    const other = 1 - turn;
    const seat = await table.getSeat(id, other);
    const hand = await table.handOf(id, other);
    const cards: number[] = [];
    for (let i = 0; i < 24; i++) if ((Number(seat.slots) >> i) & 1) cards.push(await fhevm.cleartextDb.readUint8({ euint8: hex(hand[i]!) }));
    const color = cards[0]! >> 4 < 5 ? cards[0]! >> 4 : 2;
    const expected = cards.filter((c) => c >> 4 === color).length;

    await expect(table.connect(s[turn]!).sonar(id, turn, color)).to.be.revertedWithCustomError(table, "BadSonar");
    await expect(table.connect(s[turn]!).sonar(id, other, 5)).to.be.revertedWithCustomError(table, "BadSonar");
    await expect(table.connect(s[other]!).sonar(id, turn, color)).to.be.revertedWithCustomError(table, "NotYourTurn");
    await expect(table.connect(s[turn]!).sonar(id, other, color)).to.emit(table, "Sonared").withArgs(id, turn, other, color);
    expect(Number((await table.getTable(id)).turn)).to.equal(other);

    const ping = hex(await table.sonarOf(id, turn));
    expect(await fhevm.helpers.decryptUint8({ euint8: ping, contractAddress: address, userAddress: s[turn]!.address })).to.equal(expected);
    const leaked = await fhevm.helpers.decryptUint8({ euint8: ping, contractAddress: address, userAddress: s[other]!.address }).then(
      () => true,
      () => false,
    );
    expect(leaked).to.equal(false);

    const back = await signAction(table, s[other]!, id, other, 10, { slot: turn, color: (color + 1) % 5 }, 0);
    await expect(table.relay(id, [back])).to.emit(table, "Sonared").withArgs(id, other, turn, (color + 1) % 5);
    await expect(table.connect(s[turn]!).sonar(id, other, color)).to.be.revertedWithCustomError(table, "BadSonar");
  });

  it("settles a doubted veil with one revealed bit and refuses a forged proof", async function () {
    const { table, id } = await ready([s[0]!, s[1]!]);
    while (Number((await table.getTable(id)).stage) === 2) {
      const { checkSignaturesArgs } = await starter(table, id);
      await (await table.setStarter(id, checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof)).wait();
    }
    const t = await table.getTable(id);
    const turn = Number(t.turn);
    const judge = 1 - turn;
    const claim = Number(t.color) * 16 + 7;
    const seen = (await table.handOf(id, turn))[2]!;
    const truth = (await fhevm.cleartextDb.readUint8({ euint8: hex(seen) })) === claim;
    await expect(table.connect(s[turn]!).veil(id, 2, 0x0e, seen)).to.be.revertedWithCustomError(table, "BadCard");
    await expect(table.connect(s[turn]!).veil(id, 2, claim, seen)).to.emit(table, "Veiled").withArgs(id, turn, 2, claim);
    expect(Number((await table.getTable(id)).topCard)).to.equal(claim);
    expect((await table.getSeat(id, turn)).veilUsed).to.equal(true);
    await expect(table.connect(s[turn]!).doubtVeil(id)).to.be.revertedWithCustomError(table, "NotYourTurn");
    await (await table.connect(s[judge]!).doubtVeil(id)).wait();
    expect(Number((await table.getTable(id)).stage)).to.equal(4);
    const { clearValue, checkSignaturesArgs } = await fhevm.helpers.decryptPublicBoolWithSignatures({ ebool: hex(await table.hadColorOf(id)) });
    expect(clearValue).to.equal(truth);
    const forged = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [!clearValue]);
    await expect(table.resolveChallenge(id, forged, checkSignaturesArgs.decryptionProof)).to.be.revert(ethers);
    const before = [Number((await table.getSeat(id, turn)).handSize), Number((await table.getSeat(id, judge)).handSize)];
    await expect(table.resolveChallenge(id, checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof)).to.emit(table, "VeilResolved").withArgs(id, truth);
    const after = [Number((await table.getSeat(id, turn)).handSize), Number((await table.getSeat(id, judge)).handSize)];
    expect(after).to.deep.equal(truth ? [before[0], before[1]! + 2] : [before[0]! + 4, before[1]]);
    const end = await table.getTable(id);
    expect([Number(end.stage), Number(end.turn), Number(end.veilBy)]).to.deep.equal([3, judge, 255]);
  });
});
