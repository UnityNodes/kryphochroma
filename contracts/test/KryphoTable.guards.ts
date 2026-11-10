import { expect } from "chai";
import { network } from "hardhat";

type Connection = Awaited<ReturnType<typeof network.connect>>;
type Signer = Awaited<ReturnType<Connection["ethers"]["getSigners"]>>[number];

let ethers: Connection["ethers"];
let fhevm: Connection["fhevm"];
let networkHelpers: Connection["networkHelpers"];
const hex = (value: string): `0x${string}` => value as `0x${string}`;
const config = { seats: 2, turnTimeout: 90, targetScore: 500, singleRound: true, stackDrawTwo: false };

async function ready(players: Signer[]) {
  const table = await ethers.deployContract("KryphoTable");
  const [creator] = players;
  if (!creator) throw new Error("no creator");
  await (await table.connect(creator).createTable({ ...config, seats: players.length })).wait();
  const id = await table.tableCount();
  for (const p of players) await (await table.connect(p).join(id, p.address)).wait();
  await (await table.connect(creator).start(id)).wait();
  for (let step = 0; step < 60; step++) await (await table.setupStep(id, { gasLimit: 16_700_000 })).wait();
  for (let seat = 0; seat < players.length; seat++) await (await table.dealSeat(id, seat)).wait();
  return { table, id };
}

async function starter(table: Awaited<ReturnType<typeof ready>>["table"], id: bigint) {
  const ptr = Number((await table.getTable(id)).deckPtr);
  return fhevm.helpers.decryptPublicUint8WithSignatures({ euint8: hex(await table.deckCardAt(id, ptr)) });
}

describe("KryphoTable guards", function () {
  let s: Signer[];

  before(async function () {
    ({ ethers, fhevm, networkHelpers } = await network.connect());
    s = await ethers.getSigners();
  });

  it("validates config and lobby rules", async function () {
    const table = await ethers.deployContract("KryphoTable");
    await expect(table.createTable({ ...config, seats: 1 })).to.be.revertedWithCustomError(table, "BadConfig");
    await expect(table.createTable({ ...config, seats: 5 })).to.be.revertedWithCustomError(table, "BadConfig");
    await expect(table.createTable({ ...config, turnTimeout: 5 })).to.be.revertedWithCustomError(table, "BadConfig");
    await expect(table.createTable({ ...config, targetScore: 0 })).to.be.revertedWithCustomError(table, "BadConfig");
    await expect(table.createTable({ ...config, targetScore: 10_001 })).to.be.revertedWithCustomError(table, "BadConfig");
    await (await table.createTable(config)).wait();
    const id = await table.tableCount();
    await expect(table.join(id, ethers.ZeroAddress)).to.be.revertedWithCustomError(table, "BadSession");
    await expect(table.start(id)).to.be.revertedWithCustomError(table, "BadConfig");
    await (await table.join(id, s[5]!.address, { value: ethers.parseEther("0.01") })).wait();
    expect(await ethers.provider.getBalance(s[5]!.address)).to.be.greaterThan(0n);
    await expect(table.join(id, s[6]!.address)).to.be.revertedWithCustomError(table, "AlreadySeated");
    await (await table.connect(s[1]!).join(id, s[1]!.address)).wait();
    await expect(table.connect(s[2]!).join(id, s[2]!.address)).to.be.revertedWithCustomError(table, "TableFull");
    await expect(table.connect(s[1]!).start(id)).to.be.revertedWithCustomError(table, "NotCreator");
    await expect(table.dealSeat(id, 0)).to.be.revertedWithCustomError(table, "WrongStage");
    await expect(table.dealSeat(999, 0)).to.be.revertedWithCustomError(table, "WrongStage");
  });

  it("deals only after the full shuffle and only once per seat", async function () {
    const table = await ethers.deployContract("KryphoTable");
    await (await table.createTable(config)).wait();
    const id = await table.tableCount();
    await (await table.join(id, s[0]!.address)).wait();
    await (await table.connect(s[1]!).join(id, s[1]!.address)).wait();
    await (await table.start(id)).wait();
    await expect(table.dealSeat(id, 0)).to.be.revertedWithCustomError(table, "WrongStage");
    for (let step = 0; step < 60; step++) await (await table.setupStep(id, { gasLimit: 16_700_000 })).wait();
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
    const forged = ethers.AbiCoder.defaultAbiCoder().encode(["uint8"], [(first.clearValue + 1) % 10]);
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
    await expect(table.connect(actor).play(id, 0, 0x4f, 0, seen)).to.be.revertedWithCustomError(table, "BadCard");
    const top = Number(t.topCard);
    const offColor = ((top >> 4) + 1) % 4;
    const offRank = ((top & 15) + 1) % 10;
    await expect(table.connect(actor).play(id, 0, offColor * 16 + offRank, 0, seen)).to.be.revertedWithCustomError(table, "IllegalCard");
    await expect(table.connect(actor).play(id, 0, 0x4d, 7, seen)).to.be.revertedWithCustomError(table, "BadColor");
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
    const table = await ethers.deployContract("KryphoTable");
    await (await table.createTable(config)).wait();
    const id = await table.tableCount();
    await expect(table.connect(s[1]!).cancel(id)).to.be.revertedWithCustomError(table, "NotCreator");
    await expect(table.cancel(id)).to.emit(table, "TableCancelled");
    await expect(table.join(id, s[0]!.address)).to.be.revertedWithCustomError(table, "WrongStage");
    await expect(table.cancel(id)).to.be.revertedWithCustomError(table, "WrongStage");
  });

  it("needs every seat prepared before the final reveal", async function () {
    const table = await ethers.deployContract("KryphoTable");
    await (await table.createTable(config)).wait();
    const id = await table.tableCount();
    await expect(table.prepareReveal(id)).to.be.revertedWithCustomError(table, "WrongStage");
  });
});
