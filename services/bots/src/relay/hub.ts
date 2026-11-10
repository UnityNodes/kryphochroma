import {
  ACTION_TYPES,
  type ChainSeat,
  type ChainTable,
  type SignedAction,
  actionDomain,
  fieldsFor,
  kryphoTableAbi,
  stepAction,
  project,
  projectChain,
  toContractAction,
} from "@kryphochroma/abi";
import { type Card, type GameEvent, type GameState, chooseMove } from "@kryphochroma/rules";
import { ZamaSDK } from "@zama-fhe/sdk";
import { sepolia as zamaSepolia } from "@zama-fhe/sdk/chains";
import { node } from "@zama-fhe/sdk/node";
import { createConfig } from "@zama-fhe/sdk/viem";
import { type Hex, type PublicClient, type WalletClient, createWalletClient, http, recoverTypedDataAddress } from "viem";
import { type PrivateKeyAccount, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const MAX_BATCH = 12;
const RELAY_GAS = 16_000_000n;
const GAS_PRICE = 5_000_000n;
const THINK_MS = [250, 600] as const;

export type HubMessage =
  | { readonly type: "action"; readonly action: SignedAction; readonly events: readonly GameEvent[] }
  | { readonly type: "backlog"; readonly actions: readonly SignedAction[] }
  | { readonly type: "chain"; readonly block: string };

interface Bot {
  readonly account: PrivateKeyAccount;
  readonly sdk: ZamaSDK;
  readonly plain: Map<Hex, number>;
  permitted: boolean;
}

export interface RelayDeps {
  readonly publicClient: PublicClient;
  readonly relayer: WalletClient;
  readonly table: Hex;
  readonly rpcUrl: string;
  readonly botKeys: readonly Hex[];
  readonly log: (entry: Record<string, unknown>) => void;
}

interface TableHub {
  chain: GameState | null;
  chainNonces: number[];
  sessions: string[];
  log: SignedAction[];
  inflight: boolean;
  thinking: Set<number>;
  subscribers: Set<(message: HubMessage) => void>;
}

const json = (value: unknown) => JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));
export const encodeMessage = (message: HubMessage): string => json(message);

export function createRelay(deps: RelayDeps) {
  const hubs = new Map<string, TableHub>();
  const domain = actionDomain(sepolia.id, deps.table);
  const bots: Bot[] = deps.botKeys.map((key) => {
    const account = privateKeyToAccount(key);
    const walletClient = createWalletClient({ account, chain: sepolia, transport: http(deps.rpcUrl) });
    const sdk = new ZamaSDK(createConfig({ chains: [zamaSepolia], publicClient: deps.publicClient, walletClient, relayers: { [zamaSepolia.id]: node() } }));
    return { account, sdk, plain: new Map(), permitted: false };
  });

  const hubOf = (id: bigint): TableHub => {
    const key = id.toString();
    let hub = hubs.get(key);
    if (!hub) {
      hub = { chain: null, chainNonces: [0, 0, 0, 0], sessions: [], log: [], inflight: false, thinking: new Set(), subscribers: new Set() };
      hubs.set(key, hub);
    }
    return hub;
  };

  const broadcast = (hub: TableHub, message: HubMessage) => {
    for (const send of hub.subscribers) send(message);
  };

  const projected = (hub: TableHub) => (hub.chain ? project(hub.chain, hub.chainNonces, hub.log) : null);

  async function decryptBotHand(bot: Bot, id: bigint, seat: number, slots: number): Promise<(Card | null)[]> {
    const handles = (await deps.publicClient.readContract({ address: deps.table, abi: kryphoTableAbi, functionName: "handOf", args: [id, seat] } as never)) as readonly Hex[];
    const missing = handles.filter((h, i) => (slots & (1 << i)) !== 0 && !bot.plain.has(h));
    if (missing.length > 0) {
      if (!bot.permitted) {
        await bot.sdk.permits.grantPermit([deps.table]);
        bot.permitted = true;
      }
      try {
        const values = await bot.sdk.decryption.decryptValues(missing.map((encryptedValue) => ({ encryptedValue, contractAddress: deps.table })));
        for (const [handle, value] of Object.entries(values)) bot.plain.set(handle as Hex, Number(value));
      } catch (error) {
        deps.log({ event: "bot-decrypt-pending", id, seat, message: (error as Error).message.slice(0, 120) });
      }
    }
    return handles.map((h, i) => ((slots & (1 << i)) !== 0 ? (bot.plain.get(h) ?? null) : null));
  }

  async function refresh(id: bigint): Promise<void> {
    const hub = hubOf(id);
    const read = (functionName: string, args: readonly unknown[]) =>
      deps.publicClient.readContract({ address: deps.table, abi: kryphoTableAbi, functionName, args } as never) as Promise<unknown>;
    const table = (await read("getTable", [id])) as ChainTable & { joined: number };
    const seats = (await Promise.all(Array.from({ length: Number(table.joined) }, (_, i) => read("getSeat", [id, i])))) as (ChainSeat & { session: Hex })[];
    const discard = ((await read("discardOf", [id])) as readonly number[]).map(Number);
    const nonces = ((await read("noncesOf", [id])) as readonly number[]).map(Number);
    const known = new Map<number, readonly (Card | null)[]>();
    for (const [seat, s] of seats.entries()) {
      const bot = bots.find((b) => b.account.address.toLowerCase() === s.session.toLowerCase());
      if (bot && Number(table.stage) >= 3) known.set(seat, await decryptBotHand(bot, id, seat, Number(s.slots)));
    }
    hub.chain = projectChain(table, seats, discard, known);
    hub.chainNonces = nonces;
    hub.sessions = seats.map((s) => s.session.toLowerCase());
    hub.log = hub.log.filter((a) => a.nonce >= (nonces[a.seat] ?? 0));
    driveBots(id, hub);
  }

  async function accept(action: SignedAction): Promise<{ ok: true } | { ok: false; reason: string }> {
    const hub = hubOf(action.table);
    if (!hub.chain) await refresh(action.table);
    const signer = await recoverTypedDataAddress({ domain, types: ACTION_TYPES, primaryType: "Action", message: { ...action }, signature: action.signature });
    if (signer.toLowerCase() !== hub.sessions[action.seat]) return { ok: false, reason: "BadSignature" };
    const current = projected(hub);
    if (!current) return { ok: false, reason: "WrongStage" };
    const expected = (hub.chainNonces[action.seat] ?? 0) + current.valid.filter((a) => a.seat === action.seat).length;
    if (action.nonce !== expected) return { ok: false, reason: "BadNonce" };
    const next = stepAction(current.state, action);
    if (!next) return { ok: false, reason: "IllegalMove" };
    hub.log.push(action);
    broadcast(hub, { type: "action", action, events: next.events });
    driveBots(action.table, hub);
    return { ok: true };
  }

  function driveBots(id: bigint, hub: TableHub) {
    const current = projected(hub);
    if (!current || current.state.pub.stage !== "Playing") return;
    for (const bot of bots) {
      const seat = hub.sessions.indexOf(bot.account.address.toLowerCase());
      if (seat < 0 || hub.thinking.has(seat)) continue;
      const move = chooseMove(current.state.pub, seat, current.state.hands[seat] ?? []);
      if (!move) continue;
      hub.thinking.add(seat);
      setTimeout(async () => {
        try {
          const now = projected(hub);
          if (!now) return;
          const again = chooseMove(now.state.pub, seat, now.state.hands[seat] ?? []);
          if (!again) return;
          const nonce = (hub.chainNonces[seat] ?? 0) + now.valid.filter((a) => a.seat === seat).length;
          const handles = (await deps.publicClient.readContract({ address: deps.table, abi: kryphoTableAbi, functionName: "handOf", args: [id, seat] } as never)) as readonly Hex[];
          const fields = fieldsFor(id, seat, again, nonce, handles);
          const signature = await bot.account.signTypedData({ domain, types: ACTION_TYPES, primaryType: "Action", message: { ...fields } });
          const result = await accept({ ...fields, signature });
          if (!result.ok) deps.log({ event: "bot-action-refused", id, seat, reason: result.reason });
        } catch (error) {
          deps.log({ event: "bot-error", id, seat, message: (error as Error).message.slice(0, 200) });
        } finally {
          hub.thinking.delete(seat);
          driveBots(id, hub);
        }
      }, THINK_MS[0] + Math.random() * (THINK_MS[1] - THINK_MS[0]));
    }
  }

  async function submit(id: bigint): Promise<void> {
    const hub = hubOf(id);
    if (hub.inflight || !hub.chain) return;
    const batch = project(hub.chain, hub.chainNonces, hub.log).valid.slice(0, MAX_BATCH);
    if (batch.length === 0) return;
    hub.inflight = true;
    try {
      const hash = await deps.relayer.writeContract({
        address: deps.table,
        abi: kryphoTableAbi,
        functionName: "relay",
        args: [id, batch.map(toContractAction)],
        gas: RELAY_GAS,
        gasPrice: GAS_PRICE,
        chain: sepolia,
        account: deps.relayer.account ?? null,
      } as never);
      const receipt = await deps.publicClient.waitForTransactionReceipt({ hash });
      deps.log({ event: "relay", id, actions: batch.length, hash, status: receipt.status, gas: receipt.gasUsed });
    } catch (error) {
      deps.log({ event: "relay-error", id, message: (error as Error).message.slice(0, 200) });
    } finally {
      hub.inflight = false;
      await refresh(id).catch(() => undefined);
    }
  }

  function subscribe(id: bigint, send: (message: HubMessage) => void): () => void {
    const hub = hubOf(id);
    hub.subscribers.add(send);
    const current = projected(hub);
    send({ type: "backlog", actions: current?.valid ?? [] });
    return () => hub.subscribers.delete(send);
  }

  return { refresh, accept, submit, subscribe, active: () => [...hubs.keys()].map(BigInt) };
}
