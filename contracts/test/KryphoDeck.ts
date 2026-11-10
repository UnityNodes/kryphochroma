import { expect } from "chai";
import { network } from "hardhat";
import { fullDeck } from "@kryphochroma/rules";

type Connection = Awaited<ReturnType<typeof network.connect>>;
let ethers: Connection["ethers"];
let fhevm: Connection["fhevm"];

const hex = (value: string): `0x${string}` => value as `0x${string}`;

describe("KryphoDeck", function () {
  before(async function () {
    ({ ethers, fhevm } = await network.connect());
  });

  it("lays out the same 108 cards as the rules engine", async function () {
    const harness = await ethers.deployContract("DeckHarness");
    const onChain: number[] = [];
    for (let i = 0; i < 108; i++) onChain.push(Number(await harness.cardAt(i)));
    expect(onChain).to.deep.equal(fullDeck());
  });

  it("stays a permutation after shuffle layers", async function () {
    const harness = await ethers.deployContract("DeckHarness");
    await (await harness.fill()).wait();
    for (let l = 0; l < 7; l++) await (await harness.shuffleLayer(l, { gasLimit: 16_700_000 })).wait();
    const cards: number[] = [];
    for (let i = 0; i < 108; i++) cards.push(await fhevm.cleartextDb.readUint8({ euint8: hex(await harness.deckAt(i)) }));
    expect([...cards].sort((a, b) => a - b)).to.deep.equal([...fullDeck()].sort((a, b) => a - b));
    expect(cards).to.not.deep.equal(fullDeck());
  });
});
