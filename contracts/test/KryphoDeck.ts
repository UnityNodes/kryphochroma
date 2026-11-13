import { expect } from "chai";
import { network } from "hardhat";
import { DECK_SIZE, fullDeck, isValidCard } from "@kryphochroma/rules";

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

  it("maps an encrypted index to the same card as the plaintext layout", async function () {
    const harness = await deployHarness();
    for (let i = 0; i < DECK_SIZE; i++) {
      await (await harness.encode(i)).wait();
      expect(await fhevm.cleartextDb.readUint8({ euint8: hex(await harness.lastCard()) }), `index ${i}`).to.equal(Number(await harness.cardAt(i)));
    }
  });

  it("fills a deck with valid cards drawn on their own", async function () {
    const harness = await deployHarness();
    const steps = Number(await harness.fillSteps());
    for (let step = 0; step < steps; step++) await (await harness.fill(step, { gasLimit: 16_700_000 })).wait();
    const cards: number[] = [];
    for (let i = 0; i < DECK_SIZE; i++) cards.push(await fhevm.cleartextDb.readUint8({ euint8: hex(await harness.deckAt(i)) }));
    expect(cards.every(isValidCard)).to.equal(true);
    expect(new Set(cards).size).to.be.greaterThan(20);
  });
});
