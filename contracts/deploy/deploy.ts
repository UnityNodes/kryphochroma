import { mkdirSync, writeFileSync } from "node:fs";
import { network } from "hardhat";

const { ethers } = await network.connect();
const [deployer] = await ethers.getSigners();
if (!deployer) throw new Error("no deployer");
const table = await ethers.deployContract("KryphoTable");
await table.waitForDeployment();
const receipt = await table.deploymentTransaction()?.wait();
const record = {
  chainId: Number((await ethers.provider.getNetwork()).chainId),
  KryphoTable: await table.getAddress(),
  deployer: deployer.address,
  tx: receipt?.hash,
  block: receipt?.blockNumber,
};
mkdirSync(new URL("../../deployments/", import.meta.url), { recursive: true });
writeFileSync(new URL("../../deployments/sepolia.json", import.meta.url), `${JSON.stringify(record, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(record)}\n`);
