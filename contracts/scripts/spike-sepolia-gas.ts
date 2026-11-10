import { writeFileSync } from "node:fs";
import { network } from "hardhat";

const { ethers, fhevm } = await network.connect();
const rows: Record<string, unknown>[] = [];
const out = process.env.SPIKE_OUT;
const log = (row: Record<string, unknown>) => {
  rows.push(row);
  if (out) writeFileSync(out, JSON.stringify(rows, null, 2));
  process.stdout.write(`${JSON.stringify(row)}\n`);
};

const ids = Array.from({ length: 108 }, (_, i) => {
  if (i >= 100) return (i - 100) % 2 === 0 ? 0x4d : 0x4e;
  const color = Math.floor(i / 25);
  const offset = i % 25;
  return offset === 0 ? color * 16 : color * 16 + Math.floor((offset + 1) / 2);
});

const spike = await ethers.deployContract("DeckSpike");
await spike.waitForDeployment();
log({ action: "deploy", address: await spike.getAddress() });

async function send(action: string, call: () => Promise<{ hash: string; wait: () => Promise<{ gasUsed: bigint; blockNumber: number; status: number | null } | null> }>) {
  const started = Date.now();
  const tx = await call();
  const receipt = await tx.wait();
  let hcu: number | null = null;
  try {
    hcu = (await fhevm.computeTransactionHCU(tx.hash)).globalHCU;
  } catch {
    hcu = null;
  }
  log({ action, tx: tx.hash, gas: receipt?.gasUsed.toString(), hcu, ms: Date.now() - started });
}

const chunk = 18;
for (let start = 0; start < 108; start += chunk) {
  const part = ids.slice(start, start + chunk);
  await send(`init chunk ${start}..${start + part.length - 1}`, () => spike.initChunk(start, part, { gasLimit: 16_000_000 }));
}
for (const pairs of [9, 18, 27]) {
  try {
    const gas = await spike.shufflePairs.estimateGas(0, 0, pairs);
    log({ action: `estimate shuffle ${pairs} pairs (d=1)`, gas: gas.toString(), perPair: (Number(gas) / pairs).toFixed(0) });
  } catch (error) {
    log({ action: `estimate shuffle ${pairs} pairs (d=1)`, error: String((error as Error).message).slice(0, 120) });
  }
}
