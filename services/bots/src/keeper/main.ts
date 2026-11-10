import { loadKeeperConfig, runKeeper } from "./run.js";

await runKeeper(loadKeeperConfig(process.env), process.env);
