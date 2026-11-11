import { mkdirSync, writeFileSync } from "node:fs";
import { network } from "hardhat";

const { ethers } = await network.connect();
const [deployer] = await ethers.getSigners();
if (!deployer) throw new Error("no deployer");
const takeoverKey = process.env.TAKEOVER_PRIVATE_KEY;
if (!takeoverKey) throw new Error("TAKEOVER_PRIVATE_KEY is not set");
const takeover = new ethers.Wallet(takeoverKey).address;
const deck = await ethers.deployContract("KryphoDeck");
await deck.waitForDeployment();
const score = await ethers.deployContract("KryphoScore");
await score.waitForDeployment();
const libraries = { KryphoDeck: await deck.getAddress(), KryphoScore: await score.getAddress() };
const table = await ethers.deployContract("KryphoTable", [takeover], { libraries });
await table.waitForDeployment();
const receipt = await table.deploymentTransaction()?.wait();
const record = {
  chainId: Number((await ethers.provider.getNetwork()).chainId),
  KryphoTable: await table.getAddress(),
  deployer: deployer.address,
  takeover,
  libraries,
  tx: receipt?.hash,
  block: receipt?.blockNumber,
};
mkdirSync(new URL("../../deployments/", import.meta.url), { recursive: true });
writeFileSync(new URL("../../deployments/sepolia.json", import.meta.url), `${JSON.stringify(record, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(record)}\n`);
