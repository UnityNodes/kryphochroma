"use client";

import { SETUP_STEPS } from "@kryphochroma/abi";
import { Bot, Check, Loader2, Users, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createPublicClient } from "viem";
import { sepolia } from "viem/chains";
import { loadBurner } from "@/chain/burner";
import { friendlyError } from "@/chain/errors";
import { RECEIPT_POLL_MS, sepoliaTransport } from "@/chain/rpc";
import { trackSeat } from "@/chain/inflight";
import { type SeatDeps, fundBurner, openTable, requestBots, serviceDrip as drip, startTable, takeSeat } from "@/chain/seat";
import { ProfileChip } from "@/components/profile/ProfileChip";
import { useMyProfile } from "@/components/profile/useMyProfile";
import { WalletBar } from "@/components/wallet/WalletBar";
import { useFunder } from "@/components/wallet/useFunder";
import { tableCode, tablePath } from "@/lib/invite";
import { cn } from "@/lib/utils";

type Flow = "quick" | "friends" | "bots";

const FLOW_STEPS: Record<Flow, readonly string[]> = {
  quick: ["Session key created in this tab", "Gas for the session key", "You took a seat at a shuffled table", "Bots seated"],
  friends: ["Session key created in this tab", "Gas for the session key", "A shuffled table is ready", "You took a seat", "Invite link ready"],
  bots: ["Session key created in this tab", "Gas for the session key", "A shuffled table is ready", "You took a seat", "Bots seated", "Game starting"],
};
const TURN_TIMEOUT_S = 120;
const OPEN_REFRESH_MS = 8000;

interface OpenTable {
  readonly id: string;
  readonly joined: number;
  readonly seats: number;
  readonly creator: string;
}

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

  /** A reserved pool table is already shuffled, so the lobby opens at once and the seat, the bots and the start follow in the background. */
  function seatInBackground(d: SeatDeps, id: bigint, after?: () => Promise<void>) {
    const seating = (async () => {
      await fundBurner(d);
      await takeSeat(d, id);
    })();
    trackSeat(id.toString(), seating)
      .then(async () => after?.())
      .catch((e: unknown) => toast.error(friendlyError(e)));
    router.push(tablePath(id));
  }

  async function reserve(path: string, body?: unknown): Promise<bigint | null> {
    const res = await fetch(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
    const pool = (await res.json().catch(() => ({}))) as { id?: string; warming?: number };
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

  return (
    <div className="kc-app">
      <main className="kc-table grid place-items-center overflow-auto">
        <div className="kc-rays" />
        <div className="kc-grain" />
        <div className="relative z-10 col-[1/-1] row-[1/-1] mx-4 my-6 grid w-full max-w-[960px] gap-5 place-self-center md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <section className="kc-box grid gap-4 text-left" style={{ maxWidth: "none" }} aria-labelledby="new-title">
            <h2 id="new-title" className="text-center">
              Play on Sepolia
            </h2>
            <p className="text-center">
              {wallet
                ? "Your wallet signs one join for a session key that lives only in this tab. The session key plays the moves, it can never move your funds."
                : "You play with a key that lives only in this tab. We send it a little test ETH, so you do not need a wallet."}
            </p>
            <ProfileChip profile={me.profile} onSave={me.update} />
            <WalletBar disabled={running} />
            <div className="grid gap-3">
              <button type="button" className="kc-btn kc-mono justify-center" onClick={quick} disabled={disabled}>
                <Zap aria-hidden />
                Quick game vs bots
              </button>
              <div className="flex items-center justify-center gap-2" role="radiogroup" aria-label="Players">
                {[2, 3, 4].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={seats === n} className={cn("kc-chip", seats === n && "kc-chip-on")} onClick={() => setSeats(n)} disabled={running}>
                    {n} players
                  </button>
                ))}
              </div>
              <label className="flex items-center justify-center gap-2 text-sm">
                <input type="checkbox" checked={stack} onChange={(e) => setStack(e.target.checked)} disabled={running} />
                Stack draw two cards
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" className="kc-btn justify-center" onClick={friends} disabled={disabled}>
                  <Users aria-hidden />
                  With friends
                </button>
                <button type="button" className="kc-btn justify-center" onClick={withBots} disabled={disabled}>
                  <Bot aria-hidden />
                  With bots
                </button>
              </div>
            </div>
            {done >= 0 && (
              <ol className="grid gap-2 text-sm" aria-live="polite">
                {steps.map((step, i) => (
                  <li key={step} className={cn("flex items-center gap-2", i > done + 1 && "text-muted")}>
                    {i <= done ? <Check className="size-4 text-teal" aria-hidden /> : i === done + 1 && running ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <span className="inline-block size-4" />}
                    {step}
                  </li>
                ))}
              </ol>
            )}
            {error && (
              <p role="alert" className="text-center text-red">
                {error}
              </p>
            )}
            {warming !== null && (
              <p className="text-center text-sm" role="status">
                A shuffled table is warming up on chain: step {warming} of {SETUP_STEPS}. Try again in a minute, or open a table with friends or bots.
              </p>
            )}
          </section>
          <section className="kc-box grid content-start gap-3 text-left" style={{ maxWidth: "none" }} aria-labelledby="open-title">
            <h2 id="open-title" className="text-center">
              Open tables
            </h2>
            <p className="text-center text-sm">Tables people opened and are waiting to fill. Sit down as a guest or with your wallet.</p>
            {openTables.length === 0 ? (
              <p className="text-center text-sm text-muted">No open tables right now. Open one with friends and share the link.</p>
            ) : (
              <ul className="grid gap-2">
                {openTables.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 rounded-2xl border border-cream/15 px-3 py-2">
                    <span className="text-sm">
                      <b className="text-cream">{tableCode(t.id)}</b>
                      <span className="block text-muted">
                        {t.joined} of {t.seats} seats · host {t.creator.slice(0, 6)}…{t.creator.slice(-4)}
                      </span>
                    </span>
                    <Link href={tablePath(t.id)} className="kc-chip kc-chip-on">
                      Join
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
