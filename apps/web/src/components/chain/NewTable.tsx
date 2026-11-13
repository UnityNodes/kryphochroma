"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createPublicClient } from "viem";
import { sepolia } from "viem/chains";
import { loadBurner } from "@/chain/burner";
import { friendlyError } from "@/chain/errors";
import { RECEIPT_POLL_MS, sepoliaTransport } from "@/chain/rpc";
import { trackSeat } from "@/chain/inflight";
import { type SeatDeps, fundBurner, openTable, requestBots, seatWithRetry, serviceDrip as drip, startTable, takeSeat } from "@/chain/seat";
import { ProfileChip } from "@/components/profile/ProfileChip";
import { useMyProfile } from "@/components/profile/useMyProfile";
import { PageShell } from "@/components/site/PageShell";
import { WalletBar } from "@/components/wallet/WalletBar";
import { useFunder } from "@/components/wallet/useFunder";
import { tablePath } from "@/lib/invite";
import { FlowProgress, type OpenTable, OpenTablesPanel, OwnTablePanel, QuickPanel } from "./NewTableParts";

type Flow = "quick" | "friends" | "bots";

const FLOW_STEPS: Record<Flow, readonly string[]> = {
  quick: ["Session key created in this tab", "Gas for the session key", "You took a seat at a ready table", "Bots seated"],
  friends: ["Session key created in this tab", "Gas for the session key", "A ready table is waiting", "You took a seat", "Invite link ready"],
  bots: ["Session key created in this tab", "Gas for the session key", "A ready table is waiting", "You took a seat", "Bots seated", "Game starting"],
};
const TURN_TIMEOUT_S = 120;
const OPEN_REFRESH_MS = 8000;

function useOpenTables(): readonly OpenTable[] {
  const [tables, setTables] = useState<readonly OpenTable[]>([]);
  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const res = await fetch("/api/open");
        const body = (await res.json()) as { tables?: OpenTable[] };
        if (!stopped && Array.isArray(body.tables)) setTables(body.tables);
      } catch {
        return;
      }
    };
    void load();
    const timer = setInterval(load, OPEN_REFRESH_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);
  return tables;
}

export function NewTable() {
  const router = useRouter();
  const funderState = useFunder();
  const me = useMyProfile();
  const openTables = useOpenTables();
  const [seats, setSeats] = useState(4);
  const [stack, setStack] = useState(false);
  const [flow, setFlow] = useState<Flow>("quick");
  const [done, setDone] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [warming, setWarming] = useState<number | null>(null);
  const steps = FLOW_STEPS[flow];
  const running = done >= 0 && done < steps.length - 1 && !error;
  const wallet = funderState.ready && funderState.funder.kind === "wallet";

  function deps(): SeatDeps {
    if (!funderState.ready) throw new Error(funderState.reason === "wrong-chain" ? "Switch your wallet to Sepolia first" : "Wallet is still connecting");
    const publicClient = createPublicClient({ chain: sepolia, transport: sepoliaTransport(), pollingInterval: RECEIPT_POLL_MS });
    return { publicClient, burner: loadBurner(window.sessionStorage), funder: funderState.funder, drip };
  }

  async function run(next: Flow, task: () => Promise<void>) {
    setFlow(next);
    setError(null);
    setWarming(null);
    try {
      await task();
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  /** A reserved pool table already has its cards drawn, so the lobby opens at once and the seat, the bots and the start follow in the background. */
  function seatInBackground(d: SeatDeps, id: bigint, after?: () => Promise<void>) {
    trackSeat(id.toString(), seatWithRetry(d, id))
      .then(async () => after?.())
      .catch((e: unknown) => toast.error(`Could not take a seat: ${friendlyError(e)}`));
    router.push(tablePath(id));
  }

  async function reserve(path: string, body?: unknown): Promise<bigint | null> {
    const res = await fetch(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
    const pool = (await res.json().catch(() => ({}))) as { id?: string; warming?: number; error?: string };
    if (!res.ok) throw new Error(res.status === 429 ? "Too many tables asked for at once, wait a few seconds and try again" : (pool.error ?? "The table server did not answer, try again"));
    if (pool.id) return BigInt(pool.id);
    setWarming(pool.warming ?? 0);
    return null;
  }

  const quick = () =>
    run("quick", async () => {
      const d = deps();
      setDone(0);
      const id = await reserve("/api/quick");
      if (id === null) return;
      setDone(3);
      seatInBackground(d, id, () => requestBots(d.burner, id));
    });

  async function openOwnTable(d: SeatDeps): Promise<bigint> {
    await fundBurner(d);
    setDone(1);
    const guest = d.funder.kind === "guest";
    const id = await openTable(d, { seats, turnTimeout: TURN_TIMEOUT_S, stackDrawTwo: stack }, guest);
    if (!guest) await takeSeat(d, id);
    return id;
  }

  const friends = () =>
    run("friends", async () => {
      const d = deps();
      setDone(0);
      const ready = stack ? null : await reserve("/api/friends", { seats });
      if (ready !== null) {
        setDone(4);
        return seatInBackground(d, ready);
      }
      setWarming(null);
      const id = await openOwnTable(d);
      setDone(4);
      router.push(tablePath(id));
    });

  const withBots = () =>
    run("bots", async () => {
      const d = deps();
      setDone(0);
      const ready = stack ? null : await reserve("/api/friends", { seats });
      if (ready !== null) {
        setDone(5);
        return seatInBackground(d, ready, async () => {
          await requestBots(d.burner, ready);
          await startTable(d, ready);
        });
      }
      setWarming(null);
      const id = await openOwnTable(d);
      setDone(3);
      await requestBots(d.burner, id);
      setDone(4);
      await startTable(d, id);
      setDone(5);
      router.push(tablePath(id));
    });

  useEffect(() => {
    if (!funderState.ready || funderState.funder.kind !== "guest") return;
    const d = { publicClient: createPublicClient({ chain: sepolia, transport: sepoliaTransport(), pollingInterval: RECEIPT_POLL_MS }), burner: loadBurner(window.sessionStorage), funder: funderState.funder, drip };
    void fundBurner(d).catch(() => undefined);
  }, [funderState]);

  const disabled = running || !funderState.ready;

  const status = { steps, done, running, error, warming };
  const ownFlow = flow !== "quick";

  return (
    <PageShell>
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-8 px-4 pt-8 pb-16 sm:px-6 lg:pt-12">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
          <div className="grid max-w-2xl gap-3">
            <h1 className="font-display text-6xl leading-[.88] text-sun [text-shadow:3px_3px_0_var(--color-red),6px_6px_0_var(--color-ink)] sm:text-7xl">Pick a table</h1>
            <p className="max-w-[58ch] text-base leading-relaxed text-cream/75">
              {wallet
                ? "Your wallet signs one join for a session key that lives only in this tab. The session key plays the moves and can never touch your funds."
                : "You play with a key that lives only in this tab. We send it a little Sepolia test ETH, no wallet needed."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ProfileChip profile={me.profile} onSave={me.update} />
            <WalletBar disabled={running} />
          </div>
        </div>
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="grid gap-8">
            <QuickPanel onPlay={quick} disabled={disabled}>
              {!ownFlow && <div className="mt-6"><FlowProgress status={status} /></div>}
            </QuickPanel>
            <OwnTablePanel seats={seats} onSeats={setSeats} stack={stack} onStack={setStack} onFriends={friends} onBots={withBots} locked={running} disabled={disabled}>
              {ownFlow && <FlowProgress status={status} />}
            </OwnTablePanel>
          </div>
          <OpenTablesPanel tables={openTables} onOpen={friends} disabled={disabled} />
        </div>
      </div>
    </PageShell>
  );
}
