import type { network } from "hardhat";

type Ethers = Awaited<ReturnType<typeof network.connect>>["ethers"];

export async function linkedLibraries(ethers: Ethers): Promise<{ KryphoDeck: string; KryphoScore: string }> {
  const deck = await ethers.deployContract("KryphoDeck");
  const score = await ethers.deployContract("KryphoScore");
  return { KryphoDeck: await deck.getAddress(), KryphoScore: await score.getAddress() };
}

export async function deployHarness(ethers: Ethers, takeover: string) {
  return ethers.deployContract("TableHarness", [takeover], { libraries: await linkedLibraries(ethers) });
}

export async function deployTable(ethers: Ethers, takeover: string) {
  return ethers.deployContract("KryphoTable", [takeover], { libraries: await linkedLibraries(ethers) });
}
