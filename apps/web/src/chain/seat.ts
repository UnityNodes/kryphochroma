import { fillMessage, kryphoTableAbi } from "@kryphochroma/abi";
import { type Hex, type PrivateKeyAccount, type PublicClient, type WalletClient, createWalletClient, encodeFunctionData, keccak256, parseEventLogs } from "viem";
import { sepolia } from "viem/chains";
import { BURNER_GAS_LIMIT, BURNER_GAS_PRICE, TABLE_ADDRESS } from "./config";
import { sepoliaTransport } from "./rpc";
import { confirm } from "./confirm";
import { isFundsLag } from "./errors";

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

export async function serviceDrip(address: Hex): Promise<boolean> {
  const res = await fetch("/api/drip", { method: "POST", body: JSON.stringify({ address }) });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
  return res.ok && body.ok === true;
}

export async function requestBots(burner: PrivateKeyAccount, id: bigint): Promise<void> {
  const signature = await burner.signMessage({ message: fillMessage(id) });
  const res = await fetch("/api/fill", { method: "POST", body: JSON.stringify({ id: id.toString(), signature }) });
  if (!res.ok) throw new Error("Could not seat the bots");
}

const FUNDS_TRIES = 6;
const FUNDS_WAIT_MS = 2500;

/** Public RPC nodes lag each other, so the node that takes the first transaction may not see the faucet top-up yet. */
async function sendWhenFunded<T>(send: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await send();
    } catch (error) {
      if (!isFundsLag(error) || attempt >= FUNDS_TRIES) throw error;
      await new Promise((r) => setTimeout(r, FUNDS_WAIT_MS));
    }
  }
}

const burnerWallet = (burner: PrivateKeyAccount) => createWalletClient({ account: burner, chain: sepolia, transport: sepoliaTransport() });
const LANDED_TRIES = 4;
const LANDED_WAIT_MS = 2000;

async function landed(publicClient: PublicClient, hash: Hex): Promise<boolean> {
  for (let i = 0; i < LANDED_TRIES; i++) {
    const tx = await publicClient.getTransaction({ hash }).catch(() => null);
    if (tx) return true;
    await new Promise((r) => setTimeout(r, LANDED_WAIT_MS));
  }
  return false;
}

/** The fallback transport may resend a raw transaction to a second node after the first one already took it, so the hash is computed locally and an error only counts if the chain never saw that hash. */
async function burnerSend(publicClient: PublicClient, burner: PrivateKeyAccount, data: Hex): Promise<Hex> {
  const nonce = await publicClient.getTransactionCount({ address: burner.address, blockTag: "pending" });
  const serializedTransaction = await burner.signTransaction({ chainId: sepolia.id, to: TABLE_ADDRESS, data, nonce, gas: BURNER_GAS_LIMIT, gasPrice: BURNER_GAS_PRICE, type: "legacy" });
  const hash = keccak256(serializedTransaction);
  try {
    await burnerWallet(burner).sendRawTransaction({ serializedTransaction });
  } catch (error) {
    if (isFundsLag(error) || !(await landed(publicClient, hash))) throw error;
  }
  return hash;
}

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
      : await sendWhenFunded(() => burnerSend(publicClient, burner, encodeFunctionData({ abi: kryphoTableAbi, functionName: "join", args })));
  const receipt = await confirm(publicClient, hash, "Taking a seat").catch(async (error: Error) => {
    if (await sitsAt(publicClient, id, burner.address)) return null;
    throw error;
  });
  if (!receipt) return;
  const seated = parseEventLogs({ abi: kryphoTableAbi, logs: receipt.logs, eventName: "Joined" }).some((l) => l.args.session.toLowerCase() === burner.address.toLowerCase());
  if (!seated) throw new Error("Could not take a seat, please try again");
}

/** A slow RPC can miss the receipt of a join that did land, so the seat list on chain decides. */
async function sitsAt(publicClient: PublicClient, id: bigint, session: Hex): Promise<boolean> {
  const view = (await publicClient.readContract({ address: TABLE_ADDRESS, abi: kryphoTableAbi, functionName: "getTable", args: [id] })) as { joined: number };
  for (let seat = 0; seat < Number(view.joined); seat++) {
    const s = (await publicClient.readContract({ address: TABLE_ADDRESS, abi: kryphoTableAbi, functionName: "getSeat", args: [id, seat] })) as { session: string };
    if (s.session.toLowerCase() === session.toLowerCase()) return true;
  }
  return false;
}

export async function openTable(
  deps: SeatDeps,
  config: { readonly seats: number; readonly turnTimeout: number; readonly stackDrawTwo: boolean },
  seatHost = false,
): Promise<bigint> {
  const tableConfig = { seats: config.seats, turnTimeout: config.turnTimeout, targetScore: 500, singleRound: true, stackDrawTwo: config.stackDrawTwo };
  const data = seatHost
    ? encodeFunctionData({ abi: kryphoTableAbi, functionName: "openTable", args: [tableConfig, deps.burner.address] })
    : encodeFunctionData({ abi: kryphoTableAbi, functionName: "createTable", args: [tableConfig] });
  const hash = await sendWhenFunded(() => burnerSend(deps.publicClient, deps.burner, data));
  const receipt = await confirm(deps.publicClient, hash, "Opening the table");
  const created = parseEventLogs({ abi: kryphoTableAbi, logs: receipt.logs, eventName: "TableCreated" })[0];
  if (!created) throw new Error("Table was not created");
  return created.args.id;
}

export async function leaveTable(deps: SeatDeps, id: bigint): Promise<void> {
  const hash = await sendWhenFunded(() => burnerSend(deps.publicClient, deps.burner, encodeFunctionData({ abi: kryphoTableAbi, functionName: "leave", args: [id] })));
  await confirm(deps.publicClient, hash, "Leaving the table");
}

export async function startTable(deps: SeatDeps, id: bigint): Promise<void> {
  const hash = await sendWhenFunded(() => burnerSend(deps.publicClient, deps.burner, encodeFunctionData({ abi: kryphoTableAbi, functionName: "start", args: [id] })));
  await confirm(deps.publicClient, hash, "Starting the shuffle");
}
