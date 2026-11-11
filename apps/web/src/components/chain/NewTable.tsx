"use client";

import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { loadBurner } from "@/chain/burner";
import { SEPOLIA_RPC_URL } from "@/chain/config";
import { type SeatDeps, fundBurner, openTable, requestBots, serviceDrip as drip, startTable, takeSeat } from "@/chain/seat";
import { WalletBar } from "@/components/wallet/WalletBar";
import { useFunder } from "@/components/wallet/useFunder";
import { cn } from "@/lib/utils";

const GUEST_STEPS = ["Session key created in this tab", "Test ETH for gas", "Table opened on Sepolia", "You took a seat", "Bots seated", "Shuffle started"] as const;
const WALLET_STEPS = ["Session key created in this tab", "Wallet sent the session key gas", "Table opened on Sepolia", "Wallet took a seat for the session key", "Bots seated", "Shuffle started"] as const;
const TURN_TIMEOUT_S = 120;

export function NewTable() {
  const router = useRouter();
  const funderState = useFunder();
  const [seats, setSeats] = useState(4);
  const [stack, setStack] = useState(false);
  const [done, setDone] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [warming, setWarming] = useState<number | null>(null);
  const running = done >= 0 && done < GUEST_STEPS.length - 1 && !error;
  const wallet = funderState.ready && funderState.funder.kind === "wallet";
  const steps = wallet ? WALLET_STEPS : GUEST_STEPS;

  function deps(): SeatDeps {
    if (!funderState.ready) throw new Error(funderState.reason === "wrong-chain" ? "Switch your wallet to Sepolia first" : "Wallet is still connecting");
    const publicClient = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC_URL) });
    return { publicClient, burner: loadBurner(window.sessionStorage), funder: funderState.funder, drip };
  }

  async function run(task: () => Promise<void>) {
    setError(null);
    try {
      await task();
    } catch (e) {
      setError((e as Error).message.split("\n")[0]?.slice(0, 160) ?? "Something went wrong");
    }
  }

  const quick = () =>
    run(async () => {
      const pool = (await (await fetch("/api/quick", { method: "POST" })).json()) as { id?: string; warming?: number };
      if (!pool.id) {
        setWarming(pool.warming ?? 0);
        return;
      }
      const d = deps();
      const id = BigInt(pool.id);
      setDone(0);
      if (d.funder.kind === "guest") await fundBurner(d);
      setDone(2);
      await takeSeat(d, id);
      setDone(3);
      await requestBots(d.burner, id);
      setDone(5);
      router.push(`/t/${pool.id}`);
    });

  const own = () =>
    run(async () => {
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

  return (
    <div className="kc-app">
      <main className="kc-table grid place-items-center">
        <div className="kc-rays" />
        <div className="kc-grain" />
        <div className="kc-box relative z-10 col-[1/-1] row-[1/-1] mx-4 grid gap-4 place-self-center text-left">
          <h2 className="text-center">New table on Sepolia</h2>
          <p className="text-center">
            {wallet
              ? "Your wallet signs one join for a session key that lives only in this tab. The session key plays the moves, it can never move your funds."
              : "You play with a key that lives only in this tab. We send it a little test ETH, so you do not need a wallet."}
          </p>
          <WalletBar disabled={running} />
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
          <ol className="grid gap-2 text-sm">
            {steps.map((step, i) => (
              <li key={step} className={cn("flex items-center gap-2", i > done + 1 && "text-muted")}>
                {i <= done ? <Check className="size-4 text-teal" aria-hidden /> : i === done + 1 && running ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <span className="inline-block size-4" />}
                {step}
              </li>
            ))}
          </ol>
          {error && (
            <p role="alert" className="text-center text-red">
              {error}
            </p>
          )}
          {warming !== null && (
            <p className="text-center text-sm">A shuffled table is warming up on chain: step {warming} of 60. Try again in a minute, or open your own table below (its shuffle takes about ten minutes).</p>
          )}
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" className="kc-btn kc-mono" onClick={quick} disabled={running || !funderState.ready}>
              Quick game
            </button>
            <button type="button" className="kc-btn" onClick={own} disabled={running || !funderState.ready}>
              {error ? "Try again" : "Own table"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
