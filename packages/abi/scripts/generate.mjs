import { readFileSync, writeFileSync } from "node:fs";

const artifact = new URL("../../../contracts/artifacts/contracts/KryphoTable.sol/KryphoTable.json", import.meta.url);
const { abi } = JSON.parse(readFileSync(artifact, "utf8"));
const body = `export const kryphoTableAbi = ${JSON.stringify(abi, null, 2)} as const;\n`;
writeFileSync(new URL("../src/kryphoTable.ts", import.meta.url), body);
