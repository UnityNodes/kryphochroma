import { writeFileSync } from "node:fs";
import { network } from "hardhat";

const { ethers, fhevm } = await network.connect();
const [signer] = await ethers.getSigners();
if (!signer) throw new Error("no signer");
const hex = (value: string): `0x${string}` => value as `0x${string}`;
const rows: Record<string, unknown>[] = [];
const out = process.env.SPIKE_OUT;
const save = () => {
  if (out) writeFileSync(out, JSON.stringify(rows, null, 2));
};

async function hcuOf(hash: string): Promise<{ hcu: number | null; depth: number | null }> {
  try {
    const info = await fhevm.computeTransactionHCU(hash);
    return { hcu: info.globalHCU, depth: info.maxHCUDepth };
  } catch {
    return { hcu: null, depth: null };
  }
}

async function step(action: string, send: () => Promise<{ hash: string; wait: () => Promise<{ gasUsed: bigint; blockNumber: number } | null> }>) {
  const started = Date.now();
  const tx = await send();
  const receipt = await tx.wait();
  if (!receipt) throw new Error(`${action}: no receipt`);
  const { hcu, depth } = await hcuOf(tx.hash);
  const row = { action, tx: tx.hash, block: receipt.blockNumber, gas: receipt.gasUsed.toString(), hcu, depth, minedMs: Date.now() - started };
  rows.push(row);
  save();
  process.stdout.write(`${JSON.stringify(row)}\n`);
  return row;
}

async function until<T>(label: string, fn: () => Promise<T>, timeoutMs = 300_000): Promise<{ value: T; ms: number }> {
  const started = Date.now();
  let lastError: unknown = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await fn();
      return { value, ms: Date.now() - started };
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error(`${label} timed out: ${String(lastError)}`);
}

const existing = process.env.SPIKE_ADDRESS;
if (!existing) throw new Error("SPIKE_ADDRESS is required, deck must be initialised by spike-sepolia-gas.ts");
const spike = await ethers.getContractAt("DeckSpike", existing);
const address = existing;

const cap = { gasLimit: 16_000_000 };
await step("shuffle d=1 pairs 0..26", () => spike.shufflePairs(0, 0, 27, cap));
await step("shuffle d=1 pairs 27..53", () => spike.shufflePairs(0, 27, 27, cap));
await step("shuffle d=64 pairs 0..21", () => spike.shufflePairs(6, 0, 22, cap));
await step("shuffle d=64 pairs 22..43", () => spike.shufflePairs(6, 22, 22, cap));
const dealt = await step("deal 7 with colour", () => spike.deal(7, signer.address, true, cap));
await step("play check", () => spike.play(0, 5));
await step("draw four bit isIn", () => spike.drawFourIsIn(0, 2));

const hand0 = hex(await spike.handAt(0));
const own = await until("user decrypt", () =>
  fhevm.helpers.decryptUint8({ euint8: hand0, contractAddress: address, userAddress: signer.address }),
);
rows.push({ action: "user decrypt hand[0] after deal", ms: own.ms, sinceDealMined: true, value: "hidden" });
save();
process.stdout.write(`user decrypt ok in ${own.ms}ms\n`);

await step("reveal: makePubliclyDecryptable", () => spike.startReveal());
const bit = hex(await spike.bit());
const pub = await until("public decrypt", () => fhevm.helpers.decryptPublicBoolWithSignatures({ ebool: bit }));
rows.push({ action: "public decrypt bit", ms: pub.ms, value: pub.value.clearValue });
save();
process.stdout.write(`public decrypt ok in ${pub.ms}ms value=${pub.value.clearValue}\n`);

const forged = ethers.AbiCoder.defaultAbiCoder().encode(["bool"], [!pub.value.clearValue]);
let forgedRejected = false;
try {
  await spike.finishReveal.estimateGas(forged, pub.value.checkSignaturesArgs.decryptionProof);
} catch {
  forgedRejected = true;
}
rows.push({ action: "forged reveal rejected", ok: forgedRejected });
await step("reveal: checkSignatures", () =>
  spike.finishReveal(pub.value.checkSignaturesArgs.abiEncodedCleartexts, pub.value.checkSignaturesArgs.decryptionProof),
);
let replayRejected = false;
try {
  await spike.finishReveal.estimateGas(pub.value.checkSignaturesArgs.abiEncodedCleartexts, pub.value.checkSignaturesArgs.decryptionProof);
} catch {
  replayRejected = true;
}
rows.push({ action: "replayed reveal rejected", ok: replayRejected, dealBlock: dealt.block });
save();
process.stdout.write(`forged rejected=${forgedRejected} replay rejected=${replayRejected}\n`);
