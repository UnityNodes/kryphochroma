import { expect } from "chai";
import { network } from "hardhat";
import { DECK_SIZE, fullDeck } from "@kryphochroma/rules";

type Connection = Awaited<ReturnType<typeof network.connect>>;
let ethers: Connection["ethers"];
let fhevm: Connection["fhevm"];

const hex = (value: string): `0x${string}` => value as `0x${string}`;

describe("KryphoDeck", function () {
  before(async function () {
    ({ ethers, fhevm } = await network.connect());
  });

  const deployHarness = async () => {
    const deck = await ethers.deployContract("KryphoDeck");
    return ethers.deployContract("DeckHarness", [], { libraries: { KryphoDeck: await deck.getAddress() } });
  };

  it("lays out the same 138 cards as the rules engine", async function () {
    const harness = await deployHarness();
    const onChain: number[] = [];
    for (let i = 0; i < DECK_SIZE; i++) onChain.push(Number(await harness.cardAt(i)));
    expect(onChain).to.deep.equal(fullDeck());
  });

  it("counts the switch pairs of every layer", async function () {
    const harness = await deployHarness();
    const pairs: number[] = [];
    for (let l = 0; l < 8; l++) pairs.push(Number(await harness.pairsIn(1 << l)));
    expect(pairs).to.deep.equal([69, 68, 68, 66, 64, 64, 64, 10]);
  });

  it("stays a permutation after a full pass of half layer steps", async function () {
    const harness = await deployHarness();
    await (await harness.fill()).wait();
    for (let step = 0; step < 16; step++) await (await harness.shuffleStep(step, { gasLimit: 16_700_000 })).wait();
    const cards: number[] = [];
    for (let i = 0; i < DECK_SIZE; i++) cards.push(await fhevm.cleartextDb.readUint8({ euint8: hex(await harness.deckAt(i)) }));
    expect([...cards].sort((a, b) => a - b)).to.deep.equal([...fullDeck()].sort((a, b) => a - b));
    expect(cards).to.not.deep.equal(fullDeck());
  });
});
