import { writeFileSync } from "node:fs";
import { expect } from "chai";
import { network } from "hardhat";
import { fullDeck as engineDeck } from "@kryphochroma/rules";

const SPIKE_DECK = 108;
const fullDeck = () => engineDeck().slice(0, SPIKE_DECK);

type Connection = Awaited<ReturnType<typeof network.connect>>;
let ethers: Connection["ethers"];
let fhevm: Connection["fhevm"];

type Row = { action: string; hcu: number; depth: number; gas: string };
const rows: Row[] = [];

async function measure(action: string, tx: { wait: () => Promise<{ hash: string; gasUsed: bigint } | null> }): Promise<Row> {
  const receipt = await tx.wait();
  if (!receipt) throw new Error("no receipt");
  const info = await fhevm.computeTransactionHCU(receipt.hash);
  const row = { action, hcu: info.globalHCU, depth: info.maxHCUDepth, gas: receipt.gasUsed.toString() };
  rows.push(row);
  return row;
}

const hex = (value: string): `0x${string}` => value as `0x${string}`;

async function accounts() {
  const [owner, player, stranger] = await ethers.getSigners();
  if (!owner || !player || !stranger) throw new Error("need three signers");
  return { owner, player, stranger };
}

async function deployed() {
  const spike = await ethers.deployContract("DeckSpike");
  await (await spike.init(fullDeck())).wait();
  return spike;
}

describe("DeckSpike", function () {
  before(async function () {
    ({ ethers, fhevm } = await network.connect());
  });

  after(function () {
    if (process.env.SPIKE_OUT) writeFileSync(process.env.SPIKE_OUT, JSON.stringify(rows, null, 2));
  });

  it("measures deck setup and shuffle layers", async function () {
    const spike = await ethers.deployContract("DeckSpike");
    await measure("init 108 cards", await spike.init(fullDeck()));
    const cap = { gasLimit: 16_700_000 };
    for (let l = 0; l < 7; l++) await measure(`shuffle layer ${l} (d=${1 << l})`, await spike.shuffle(l, 1, cap));
    await measure("54 x randEbool", await spike.onlyRand(54, cap));
    await measure("108 x select", await spike.onlySelect(108, cap));
    await measure("54 x select + allowThis", await spike.onlyAllow(54, cap));
    const fused = await measure("shuffle fused 1 layer (d=1)", await spike.shuffleFused(0, 1, cap));
    expect(Number(fused.gas)).to.be.lessThan(16_777_216);
    expect(fused.depth).to.be.lessThan(5_000_000);
  });

  it("keeps the deck a permutation after a full pass", async function () {
    const spike = await deployed();
    for (let l = 0; l < 7; l++) await (await spike.shuffle(l, 1, { gasLimit: 16_700_000 })).wait();
    const cards: number[] = [];
    for (let i = 0; i < 108; i++) cards.push(await fhevm.cleartextDb.readUint8({ euint8: hex(await spike.deckAt(i)) }));
    expect([...cards].sort((a, b) => a - b)).to.deep.equal([...fullDeck()].sort((a, b) => a - b));
    expect(cards).to.not.deep.equal(fullDeck());
  });

  it("measures dealing, a play check and the draw four bit", async function () {
    const { player, stranger } = await accounts();
    const spike = await deployed();
    await (await spike.shuffle(0, 1, { gasLimit: 16_700_000 })).wait();
    await measure("deal 7 (allow only)", await spike.deal(7, player.address, false));
    await measure("deal 7 (allow + color shr)", await spike.deal(7, player.address, true));
    await measure("play check eq + and", await spike.play(0, 5));
    await measure("draw four bit isIn (13 cards)", await spike.drawFourIsIn(0, 2));
    await measure("draw four bit naive (13 cards)", await spike.drawFourNaive(0, 2));

    const spikeAddress = await spike.getAddress();
    const own = await fhevm.helpers.decryptUint8({ euint8: hex(await spike.handAt(0)), contractAddress: spikeAddress, userAddress: player.address });
    expect(own).to.be.a("number");
    let denied = false;
    try {
      await fhevm.helpers.decryptUint8({ euint8: hex(await spike.handAt(0)), contractAddress: spikeAddress, userAddress: stranger.address });
    } catch {
      denied = true;
    }
    expect(denied).to.equal(true);
  });

  it("measures a 24 card draw four bit", async function () {
    const { player } = await accounts();
    const spike = await deployed();
    await (await spike.deal(24, player.address, true)).wait();
    await measure("draw four bit isIn (24 cards)", await spike.drawFourIsIn(0, 1));
    await measure("draw four bit naive (24 cards)", await spike.drawFourNaive(0, 1));
  });

  it("reveals one bit with a proof, rejects forgery and replay", async function () {
    const { player } = await accounts();
    const spike = await deployed();
    await (await spike.deal(7, player.address, true)).wait();
    await (await spike.drawFourIsIn(0, 0)).wait();
    await measure("reveal: makePubliclyDecryptable", await spike.startReveal());
    const handle = hex(await spike.bit());
    const { clearValue, checkSignaturesArgs } = await fhevm.helpers.decryptPublicBoolWithSignatures({ ebool: handle });
    const forged = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [!clearValue]);
    let forgedFailed = false;
    try {
      await (await spike.finishReveal(forged, checkSignaturesArgs.decryptionProof)).wait();
    } catch {
      forgedFailed = true;
    }
    expect(forgedFailed).to.equal(true);
    await measure("reveal: checkSignatures", await spike.finishReveal(checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof));
    expect(await spike.bitValue()).to.equal(clearValue);
    await expect(spike.finishReveal(checkSignaturesArgs.abiEncodedCleartexts, checkSignaturesArgs.decryptionProof)).to.be.revertedWithCustomError(spike, "AlreadyRevealed");
  });
});
