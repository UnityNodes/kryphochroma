"use client";

import { SETUP_STEPS } from "@kryphochroma/abi";
import { Bot, Check, Loader2, Users, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPublicClient } from "viem";
import { sepolia } from "viem/chains";
import { loadBurner } from "@/chain/burner";
import { sepoliaTransport } from "@/chain/rpc";
import { type SeatDeps, fundBurner, openTable, requestBots, serviceDrip as drip, startTable, takeSeat } from "@/chain/seat";
import { WalletBar } from "@/components/wallet/WalletBar";
import { useFunder } from "@/components/wallet/useFunder";
import { cn } from "@/lib/utils";

type Flow = "quick" | "friends" | "bots";

const FLOW_STEPS: Record<Flow, readonly string[]> = {
  quick: ["Session key created in this tab", "Gas for the session key", "You took a seat at a shuffled table", "Bots seated"],
  friends: ["Session key created in this tab", "Gas for the session key", "Table opened on Sepolia", "You took a seat", "Invite link ready"],
  bots: ["Session key created in this tab", "Gas for the session key", "Table opened on Sepolia", "You took a seat", "Bots seated", "Shuffle started"],
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
    const publicClient = createPublicClient({ chain: sepolia, transport: sepoliaTransport() });
    return { publicClient, burner: loadBurner(window.sessionStorage), funder: funderState.funder, drip };
  }

  async function run(next: Flow, task: () => Promise<void>) {
    setFlow(next);
    setError(null);
    setWarming(null);
    try {
      await task();
    } catch (e) {
      setError((e as Error).message.split("\n")[0]?.slice(0, 160) ?? "Something went wrong");
    }
  }

  const quick = () =>
    run("quick", async () => {
      const pool = (await (await fetch("/api/quick", { method: "POST" })).json()) as { id?: string; warming?: number };
      if (!pool.id) {
        setWarming(pool.warming ?? 0);
        return;
      }
      const d = deps();
      const id = BigInt(pool.id);
      setDone(0);
      if (d.funder.kind === "guest") await fundBurner(d);
      setDone(1);
      await takeSeat(d, id);
      setDone(2);
      await requestBots(d.burner, id).catch(() => undefined);
      setDone(3);
      router.push(`/t/${pool.id}`);
    });

  const friends = () =>
    run("friends", async () => {
      const d = deps();
      setDone(0);
      await fundBurner(d);
      setDone(1);
      const id = await openTable(d, { seats, turnTimeout: TURN_TIMEOUT_S, stackDrawTwo: stack });
      setDone(2);
      await takeSeat(d, id);
      setDone(4);
      router.push(`/t/${id}`);
    });

  const withBots = () =>
    run("bots", async () => {
      const d = deps();
      setDone(0);
      await fundBurner(d);
      setDone(1);
      const id = await openTable(d, { seats, turnTimeout: TURN_TIMEOUT_S, stackDrawTwo: stack });
      setDone(2);
      await takeSeat(d, id);
      setDone(3);
      await requestBots(d.burner, id);
      setDone(4);
      await startTable(d, id);
      setDone(5);
      router.push(`/t/${id}`);
    });

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
                      <b className="text-cream">Table #{t.id}</b>
                      <span className="block text-muted">
                        {t.joined} of {t.seats} seats · host {t.creator.slice(0, 6)}…{t.creator.slice(-4)}
                      </span>
                    </span>
                    <Link href={`/t/${t.id}`} className="kc-chip kc-chip-on">
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
