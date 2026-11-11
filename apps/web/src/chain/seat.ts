import { kryphoTableAbi } from "@kryphochroma/abi";
import { type Hex, type PrivateKeyAccount, type PublicClient, type WalletClient, createWalletClient, http, parseEventLogs } from "viem";
import { sepolia } from "viem/chains";
import { BURNER_GAS_LIMIT, BURNER_GAS_PRICE, SEPOLIA_RPC_URL, TABLE_ADDRESS } from "./config";
import { confirm } from "./confirm";

export const MIN_BURNER_BALANCE = 500_000_000_000_000n;
export const WALLET_CRUMB = 2_000_000_000_000_000n;
const BALANCE_WAIT_MS = 2000;
const BALANCE_TRIES = 30;

export type Funder = { readonly kind: "guest" } | { readonly kind: "wallet"; readonly wallet: WalletClient; readonly address: Hex };

export interface SeatDeps {
  readonly publicClient: PublicClient;
  readonly burner: PrivateKeyAccount;
  readonly funder: Funder;
  readonly drip: (address: Hex) => Promise<boolean>;
}

const burnerWallet = (burner: PrivateKeyAccount) => createWalletClient({ account: burner, chain: sepolia, transport: http(SEPOLIA_RPC_URL) });

async function waitForBalance(publicClient: PublicClient, address: Hex): Promise<boolean> {
  for (let i = 0; i < BALANCE_TRIES; i++) {
    if ((await publicClient.getBalance({ address })) >= MIN_BURNER_BALANCE) return true;
    await new Promise((r) => setTimeout(r, BALANCE_WAIT_MS));
  }
  return false;
}

export async function needsGas(deps: SeatDeps): Promise<boolean> {
  return (await deps.publicClient.getBalance({ address: deps.burner.address })) < MIN_BURNER_BALANCE;
}

export async function fundBurner(deps: SeatDeps): Promise<void> {
  if (!(await needsGas(deps))) return;
  if (deps.funder.kind === "wallet") {
    const hash = await deps.funder.wallet.sendTransaction({ account: deps.funder.wallet.account ?? deps.funder.address, chain: sepolia, to: deps.burner.address, value: WALLET_CRUMB });
    await confirm(deps.publicClient, hash, "Funding the session key");
    return;
  }
  if (!(await deps.drip(deps.burner.address))) throw new Error("The faucet is busy, try again in a minute");
  if (!(await waitForBalance(deps.publicClient, deps.burner.address))) throw new Error("Test ETH did not arrive yet, try again");
}

export async function takeSeat(deps: SeatDeps, id: bigint): Promise<void> {
  const { publicClient, burner, funder } = deps;
  const args = [id, burner.address] as const;
  const hash =
    funder.kind === "wallet"
      ? await funder.wallet.writeContract({ address: TABLE_ADDRESS, abi: kryphoTableAbi, functionName: "join", args, account: funder.wallet.account ?? funder.address, chain: sepolia, value: (await needsGas(deps)) ? WALLET_CRUMB : 0n })
      : await burnerWallet(burner).writeContract({ address: TABLE_ADDRESS, abi: kryphoTableAbi, functionName: "join", args, gasPrice: BURNER_GAS_PRICE, gas: BURNER_GAS_LIMIT });
  const receipt = await confirm(publicClient, hash, "Taking a seat");
  const seated = parseEventLogs({ abi: kryphoTableAbi, logs: receipt.logs, eventName: "Joined" }).some((l) => l.args.session.toLowerCase() === burner.address.toLowerCase());
  if (!seated) throw new Error("Could not take a seat, please try again");
}

export async function openTable(deps: SeatDeps, config: { readonly seats: number; readonly turnTimeout: number; readonly stackDrawTwo: boolean }): Promise<bigint> {
  const hash = await burnerWallet(deps.burner).writeContract({
    address: TABLE_ADDRESS,
    abi: kryphoTableAbi,
    functionName: "createTable",
    args: [{ seats: config.seats, turnTimeout: config.turnTimeout, targetScore: 500, singleRound: true, stackDrawTwo: config.stackDrawTwo }],
    gasPrice: BURNER_GAS_PRICE,
    gas: BURNER_GAS_LIMIT,
  });
  const receipt = await confirm(deps.publicClient, hash, "Opening the table");
  const created = parseEventLogs({ abi: kryphoTableAbi, logs: receipt.logs, eventName: "TableCreated" })[0];
  if (!created) throw new Error("Table was not created");
  return created.args.id;
}

export async function startTable(deps: SeatDeps, id: bigint): Promise<void> {
  const hash = await burnerWallet(deps.burner).writeContract({ address: TABLE_ADDRESS, abi: kryphoTableAbi, functionName: "start", args: [id], gasPrice: BURNER_GAS_PRICE, gas: BURNER_GAS_LIMIT });
  await confirm(deps.publicClient, hash, "Starting the shuffle");
}
