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
const SETUP_STEPS = 12;

async function ready(players: Signer[], takeover = ethers.ZeroAddress) {
  const table = await deployHarness(ethers, takeover);
  const [creator] = players;
  if (!creator) throw new Error("no creator");
  await (await table.connect(creator).createTable({ ...config, seats: players.length })).wait();
  const id = await table.tableCount();
  for (const p of players) await (await table.connect(p).join(id, p.address)).wait();
  for (let step = 0; step < SETUP_STEPS; step++) await (await table.setupStep(id, { gasLimit: 16_700_000 })).wait();
  await (await table.deal(id)).wait();
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
    expect(Number((await table.getTable(id)).stage)).to.equal(1);
    await expect(table.connect(s[2]!).join(id, s[2]!.address)).to.be.revertedWithCustomError(table, "WrongStage");
    await expect(table.deal(id)).to.be.revertedWithCustomError(table, "WrongStage");
    await expect(table.deal(999)).to.be.revertedWithCustomError(table, "WrongStage");
    await expect(table.setStarter(id, "0x", "0x")).to.be.revertedWithCustomError(table, "WrongStage");
  });

  it("deals only after the full shuffle and only once", async function () {
    const table = await deployTable(ethers, ethers.ZeroAddress);
    await (await table.createTable(config)).wait();
    const id = await table.tableCount();
    await (await table.join(id, s[0]!.address)).wait();
    await (await table.connect(s[1]!).join(id, s[1]!.address)).wait();
    await expect(table.deal(id)).to.be.revertedWithCustomError(table, "WrongStage");
    for (let step = 0; step < SETUP_STEPS; step++) await (await table.setupStep(id, { gasLimit: 16_700_000 })).wait();
    await expect(table.setupStep(id)).to.be.revertedWithCustomError(table, "WrongStage");
    await (await table.deal(id)).wait();
    await expect(table.deal(id)).to.be.revertedWithCustomError(table, "BadSlot");
    expect(Number((await table.getTable(id)).stage)).to.equal(2);
    while (Number((await table.getTable(id)).stage) === 2) {
      const { checkSignaturesArgs } = await starter(table, id);
      await (await table.setStarter(id, checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof)).wait();
    }
    const t = await table.getTable(id);
    expect([Number(t.stage), Number(t.deckPtr)]).to.deep.equal([3, 14]);
    await (await table.fillQueues(id)).wait();
    expect(Number((await table.getTable(id)).deckPtr), "two queued for each seat").to.equal(18);
    await expect(table.fillQueues(id)).to.be.revertedWithCustomError(table, "QueuesFilled");
    await expect(table.setStarter(id, "0x", "0x")).to.be.revertedWithCustomError(table, "WrongStage");
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

  it("lets a player leave the lobby, hands the host role on and closes an empty table", async function () {
    const table = await deployTable(ethers, ethers.ZeroAddress);
    await (await table.connect(s[0]!).createTable({ ...config, seats: 4 })).wait();
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

  it("lets the first seat host a table the server opened, and keeps it open when everyone leaves", async function () {
    const table = await deployTable(ethers, ethers.ZeroAddress);
    await (await table.connect(s[3]!).createTable({ ...config, seats: 3 })).wait();
    const id = await table.tableCount();
    await (await table.connect(s[0]!).join(id, s[0]!.address)).wait();
    await (await table.connect(s[1]!).join(id, s[1]!.address)).wait();
    await expect(table.connect(s[1]!).start(id)).to.be.revertedWithCustomError(table, "NotCreator");
    await (await table.connect(s[0]!).leave(id)).wait();
    await (await table.connect(s[1]!).leave(id)).wait();
    const t = await table.getTable(id);
    expect([Number(t.stage), Number(t.joined), t.creator]).to.deep.equal([0, 0, s[3]!.address]);
    await (await table.connect(s[2]!).join(id, s[2]!.address)).wait();
    await (await table.connect(s[0]!).join(id, s[0]!.address)).wait();
    await (await table.connect(s[2]!).start(id)).wait();
    expect(Number((await table.getTable(id)).stage)).to.equal(1);
  });

  it("starts a table by itself when the last seat is taken", async function () {
    const table = await deployTable(ethers, ethers.ZeroAddress);
    await (await table.connect(s[3]!).openTable({ ...config, seats: 3 }, s[3]!.address)).wait();
    const id = await table.tableCount();
    await (await table.connect(s[0]!).join(id, s[0]!.address)).wait();
    await expect(table.connect(s[0]!).start(id)).to.be.revertedWithCustomError(table, "NotCreator");
    await (await table.connect(s[1]!).join(id, s[1]!.address)).wait();
    expect(Number((await table.getTable(id)).stage)).to.equal(1);
    await expect(table.connect(s[1]!).start(id)).to.be.revertedWithCustomError(table, "WrongStage");
  });

  it("needs every seat prepared before the final reveal", async function () {
    const table = await deployTable(ethers, ethers.ZeroAddress);
    await (await table.createTable(config)).wait();
    const id = await table.tableCount();
    await expect(table.prepareReveal(id)).to.be.revertedWithCustomError(table, "WrongStage");
  });

  it("seats a guest from its signed join sent by anyone, once", async function () {
    const table = await deployHarness(ethers, ethers.ZeroAddress);
    await (await table.connect(s[0]!).createTable({ ...config, seats: 2 })).wait();
    const id = await table.tableCount();
    const guest = ethers.Wallet.createRandom();
    const relayer = s[5]!;
    const join = await signAction(table, guest as never, id, 255, 11, {}, 0);
    await expect(table.connect(relayer).relayJoin(id, join)).to.emit(table, "Joined").withArgs(id, 0, guest.address, guest.address);
    const seat = await table.getSeat(id, 0);
    expect([seat.player, seat.session]).to.deep.equal([guest.address, guest.address]);
    await expect(table.connect(relayer).relayJoin(id, join)).to.be.revertedWithCustomError(table, "AlreadySeated");
    const wrongKind = await signAction(table, guest as never, id, 255, 1, {}, 0);
    await expect(table.relayJoin(id, wrongKind)).to.be.revertedWithCustomError(table, "BadAction");
    const second = ethers.Wallet.createRandom();
    await (await table.relayJoin(id, await signAction(table, second as never, id, 255, 11, {}, 0))).wait();
    expect(Number((await table.getTable(id)).stage), "the join that fills the table starts it").to.equal(1);
  });

  it("queues each seat's next cards open to that seat only", async function () {
    const { table, id } = await ready([s[0]!, s[1]!]);
    await expect(table.fillQueues(id), "the queues wait until play is open").to.be.revertedWithCustomError(table, "WrongStage");
    while (Number((await table.getTable(id)).stage) === 2) {
      const { checkSignaturesArgs } = await starter(table, id);
      await (await table.setStarter(id, checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof)).wait();
    }
    expect((await table.queueOf(id, 0)).every((h) => h === ethers.ZeroHash), "the deal leaves the queues empty").to.equal(true);
    await (await table.fillQueues(id)).wait();
    const address = await table.getAddress();
    for (const seat of [0, 1]) {
      const queue = await table.queueOf(id, seat);
      expect(queue.every((h) => h !== ethers.ZeroHash), "two queued cards after the deal").to.equal(true);
      for (const h of queue) {
        expect(await fhevm.helpers.decryptUint8({ euint8: hex(h), contractAddress: address, userAddress: s[seat]!.address })).to.be.lessThan(0x5f);
        let denied = false;
        try {
          await fhevm.helpers.decryptUint8({ euint8: hex(h), contractAddress: address, userAddress: s[1 - seat]!.address });
        } catch {
          denied = true;
        }
        expect(denied, "the other seat must not read a queued card").to.equal(true);
      }
    }
  });

  it("plays a freshly drawn card in the same relayed batch through its queued handle", async function () {
    const { table, id } = await ready([s[0]!, s[1]!]);
    while (Number((await table.getTable(id)).stage) === 2) {
      const { checkSignaturesArgs } = await starter(table, id);
      await (await table.setStarter(id, checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof)).wait();
    }
    const turn = Number((await table.getTable(id)).turn);
    const actor = s[turn]!;
    await (await table.setQueueCard(id, turn, 0, 0x5d)).wait();
    const queued = (await table.queueOf(id, turn))[0]!;
    const slot = 7;
    const draw = await signAction(table, actor, id, turn, 1, {}, 0);
    const play = await signAction(table, actor, id, turn, 0, { slot, card: 0x5d, color: 2, seenHandle: queued }, 1);
    const receipt = await (await table.relay(id, [draw, play])).wait();
    const names = receipt!.logs.map((l) => { try { return table.interface.parseLog(l)?.name; } catch { return null; } });
    expect(names).to.not.include("ActionRejected");
    expect(names.filter((n) => n === "ActionRelayed")).to.have.length(2);
    expect(names).to.include("Played");
    const t = await table.getTable(id);
    expect([Number(t.topCard), Number(t.color), Number(t.turn)]).to.deep.equal([0x5d, 2, 1 - turn]);
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

  it("opens a table and seats the host in one call", async function () {
    const table = await deployTable(ethers, ethers.ZeroAddress);
    await expect(table.connect(s[0]!).openTable(config, ethers.ZeroAddress)).to.be.revertedWithCustomError(table, "BadSession");
    await expect(table.connect(s[0]!).openTable(config, s[5]!.address)).to.emit(table, "Joined").withArgs(1n, 0, s[0]!.address, s[5]!.address);
    const t = await table.getTable(1n);
    expect([t.creator, Number(t.joined)]).to.deep.equal([s[0]!.address, 1]);
    await expect(table.connect(s[0]!).join(1n, s[6]!.address)).to.be.revertedWithCustomError(table, "AlreadySeated");
  });

  it("keeps a partial lobby shuffle when the game starts", async function () {
    const table = await deployTable(ethers, ethers.ZeroAddress);
    await (await table.createTable(config)).wait();
    const id = await table.tableCount();
    for (let step = 0; step < 5; step++) await (await table.setupStep(id, { gasLimit: 16_700_000 })).wait();
    await (await table.join(id, s[0]!.address)).wait();
    await (await table.connect(s[1]!).join(id, s[1]!.address)).wait();
    let t = await table.getTable(id);
    expect([Number(t.stage), Number(t.setupStep)]).to.deep.equal([1, 5]);
    for (let step = 5; step < SETUP_STEPS; step++) await (await table.setupStep(id, { gasLimit: 16_700_000 })).wait();
    t = await table.getTable(id);
    expect([Number(t.stage), Number(t.setupStep)]).to.deep.equal([2, SETUP_STEPS]);
    await (await table.deal(id)).wait();
    expect(Number((await table.getSeat(id, 1)).handSize)).to.equal(7);
  });

  it("reveals the starter in the lobby and opens play in the join that fills a ready table", async function () {
    const table = await deployTable(ethers, ethers.ZeroAddress);
    await (await table.connect(s[3]!).createTable(config)).wait();
    const id = await table.tableCount();
    for (let step = 0; step < SETUP_STEPS; step++) await (await table.setupStep(id, { gasLimit: 16_700_000 })).wait();
    await expect(table.setupStep(id)).to.be.revertedWithCustomError(table, "ShuffleNotDone");
    while (Number((await table.getTable(id)).topCard) === 255) {
      const { checkSignaturesArgs } = await starter(table, id);
      await (await table.setStarter(id, checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof)).wait();
    }
    let t = await table.getTable(id);
    expect(Number(t.stage)).to.equal(0);
    await expect(table.setStarter(id, "0x", "0x")).to.be.revertedWithCustomError(table, "BadCard");
    await (await table.join(id, s[0]!.address)).wait();
    await (await table.connect(s[0]!).leave(id)).wait();
    await (await table.join(id, s[0]!.address)).wait();
    await expect(table.connect(s[1]!).join(id, s[1]!.address)).to.emit(table, "Dealt");
    t = await table.getTable(id);
    expect([Number(t.stage), Number(t.deckPtr), Number(t.turn)]).to.deep.equal([3, 14, 0]);
    expect(Number(t.deckEnd)).to.equal(138 - (await table.discardOf(id)).length);
    const hand = await table.handOf(id, 1);
    expect(await fhevm.helpers.decryptUint8({ euint8: hex(hand[0]!), contractAddress: await table.getAddress(), userAddress: s[1]!.address })).to.be.a("number");
  });

  it("hands an abandoned seat and its sealed cards to the takeover bot", async function () {
    const takeover = s[9]!;
    const { table, id } = await ready([s[0]!, s[1]!], takeover.address);
    while (Number((await table.getTable(id)).stage) === 2) {
      const { checkSignaturesArgs } = await starter(table, id);
      await (await table.setStarter(id, checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof)).wait();
    }
    await (await table.fillQueues(id)).wait();
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
    const queue = await table.queueOf(id, first);
    const queued = await fhevm.helpers.decryptUint8({ euint8: hex(queue[1]!), contractAddress: address, userAddress: takeover.address });
    expect(queued).to.be.lessThan(0x5f);
    let denied = false;
    try {
      await fhevm.helpers.decryptUint8({ euint8: hex(queue[1]!), contractAddress: address, userAddress: s[first]!.address });
    } catch {
      denied = true;
    }
    expect(denied, "old session must not see a card queued after the seat was handed over").to.equal(true);
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

  it("refills a running deck with fresh draws in the background and swaps them in when the deck runs out", async function () {
    const { table, id } = await ready([s[0]!, s[1]!]);
    while (Number((await table.getTable(id)).stage) === 2) {
      const { checkSignaturesArgs } = await starter(table, id);
      await (await table.setStarter(id, checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof)).wait();
    }
    await (await table.fillQueues(id)).wait();
    await expect(table.refillStep(id), "a deck with plenty left needs no refill").to.be.revertedWithCustomError(table, "ShuffleNotDone");
    await (await table.stageDeck(id, 100, [0x01, 0x02])).wait();
    const discard = (await table.discardOf(id)).map(Number);
    await (await table.refillStep(id, { gasLimit: 16_700_000 })).wait();
    const size = 60;
    expect(Number((await table.getTable(id)).refillSize)).to.equal(size);
    for (let step = 1; step < 5; step++) await (await table.refillStep(id, { gasLimit: 16_700_000 })).wait();
    await expect(table.refillStep(id)).to.be.revertedWithCustomError(table, "ShuffleNotDone");
    expect((await table.discardOf(id)).map(Number), "the discard pile never comes back").to.deep.equal(discard);
    const refilled: number[] = [];
    for (let i = 0; i < size; i++) refilled.push(await fhevm.cleartextDb.readUint8({ euint8: hex(await table.deckCardAt(id, i)) }));
    expect(refilled.every((c) => c < 0x5f)).to.equal(true);
    let t = await table.getTable(id);
    expect(Number(t.deckPtr)).to.equal(100);
    await (await table.stageDeck(id, 138, [])).wait();
    const turn = Number(t.turn);
    const head = (await table.queueOf(id, turn))[0]!;
    await expect(table.connect(s[turn]!).draw(id)).to.emit(table, "Reshuffled").withArgs(id, size);
    t = await table.getTable(id);
    expect([Number(t.deckPtr), Number(t.deckEnd), Number(t.refillSize)]).to.deep.equal([1, size, 0]);
    const slot = Number(t.drawnSlot);
    expect((await table.handOf(id, turn))[slot], "the draw takes the head of the seat's queue").to.equal(head);
    const queued = await fhevm.cleartextDb.readUint8({ euint8: hex((await table.queueOf(id, turn))[1]!) });
    expect(queued, "the refilled deck tops the queue back up").to.equal(refilled[0]);
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

  it("settles a doubted veil with one revealed bit while the judge plays on, and refuses a forged or replayed proof", async function () {
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
    const doubted = await table.getTable(id);
    expect([Number(doubted.stage), Number(doubted.turn), Number(doubted.veilBy), Number(doubted.veilJudge)]).to.deep.equal([3, judge, turn, judge | 0x80]);
    await expect(table.connect(s[judge]!).doubtVeil(id)).to.be.revertedWithCustomError(table, "NoVeil");
    const judgeSeen = (await table.handOf(id, judge))[0]!;
    await expect(table.connect(s[judge]!).veil(id, 0, claim, judgeSeen)).to.be.revertedWithCustomError(table, "VeilUsed");
    await (await table.connect(s[judge]!).draw(id)).wait();
    const { clearValue, checkSignaturesArgs } = await fhevm.helpers.decryptPublicBoolWithSignatures({ ebool: hex(await table.hadColorOf(id)) });
    expect(clearValue).to.equal(truth);
    const forged = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [!clearValue]);
    await expect(table.resolveChallenge(id, forged, checkSignaturesArgs.decryptionProof)).to.be.revert(ethers);
    const before = [Number((await table.getSeat(id, turn)).handSize), Number((await table.getSeat(id, judge)).handSize)];
    await expect(table.resolveChallenge(id, checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof)).to.emit(table, "VeilResolved").withArgs(id, truth);
    const after = [Number((await table.getSeat(id, turn)).handSize), Number((await table.getSeat(id, judge)).handSize)];
    expect(after).to.deep.equal(truth ? [before[0], before[1]! + 2] : [before[0]! + 4, before[1]]);
    const end = await table.getTable(id);
    expect([Number(end.stage), Number(end.turn), Number(end.veilBy), Number(end.veilJudge), Number(end.drawnSlot) !== 255]).to.deep.equal([3, judge, 255, 255, true]);
    await expect(table.resolveChallenge(id, checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof)).to.be.revertedWithCustomError(table, "WrongStage");
  });
});
