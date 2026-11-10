"use client";

import { kryphoTableAbi } from "@kryphochroma/abi";
import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPublicClient, createWalletClient, http, parseEventLogs } from "viem";
import { sepolia } from "viem/chains";
import { loadBurner } from "@/chain/burner";
import { BURNER_GAS_LIMIT, BURNER_GAS_PRICE, SEPOLIA_RPC_URL, TABLE_ADDRESS } from "@/chain/config";
import { cn } from "@/lib/utils";

const STEPS = ["Session key created in this tab", "Test ETH for gas", "Table opened on Sepolia", "You took a seat", "Bots seated", "Shuffle started"] as const;
const BALANCE_WAIT_MS = 2000;
const BALANCE_TRIES = 30;
const MIN_BALANCE = 500_000_000_000_000n;
const TURN_TIMEOUT_S = 120;

export function NewTable() {
  const router = useRouter();
  const [seats, setSeats] = useState(4);
  const [stack, setStack] = useState(false);
  const [done, setDone] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const running = done >= 0 && done < STEPS.length - 1 && !error;

  async function go() {
    setError(null);
    try {
      const account = loadBurner(window.sessionStorage);
      const transport = http(SEPOLIA_RPC_URL);
      const publicClient = createPublicClient({ chain: sepolia, transport });
      const wallet = createWalletClient({ account, chain: sepolia, transport });
      setDone(0);
      if ((await publicClient.getBalance({ address: account.address })) < MIN_BALANCE) {
        const res = await fetch("/api/drip", { method: "POST", body: JSON.stringify({ address: account.address }) });
        if (!res.ok) throw new Error("The faucet is busy, try again in a minute");
        for (let i = 0; i < BALANCE_TRIES && (await publicClient.getBalance({ address: account.address })) < MIN_BALANCE; i++) {
          await new Promise((r) => setTimeout(r, BALANCE_WAIT_MS));
        }
      }
      setDone(1);
      const createHash = await wallet.writeContract({
        address: TABLE_ADDRESS,
        abi: kryphoTableAbi,
        functionName: "createTable",
        args: [{ seats, turnTimeout: TURN_TIMEOUT_S, targetScore: 500, singleRound: true, stackDrawTwo: stack }],
        gasPrice: BURNER_GAS_PRICE, gas: BURNER_GAS_LIMIT,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });
      const created = parseEventLogs({ abi: kryphoTableAbi, logs: receipt.logs, eventName: "TableCreated" })[0];
      const id = created ? (created.args as { id: bigint }).id : null;
      if (id === null) throw new Error("Table was not created");
      setDone(2);
      const joinHash = await wallet.writeContract({ address: TABLE_ADDRESS, abi: kryphoTableAbi, functionName: "join", args: [id, account.address], gasPrice: BURNER_GAS_PRICE, gas: BURNER_GAS_LIMIT });
      await publicClient.waitForTransactionReceipt({ hash: joinHash });
      setDone(3);
      const fill = await fetch("/api/fill", { method: "POST", body: JSON.stringify({ id: id.toString() }) });
      if (!fill.ok) throw new Error("Could not seat the bots");
      setDone(4);
      const startHash = await wallet.writeContract({ address: TABLE_ADDRESS, abi: kryphoTableAbi, functionName: "start", args: [id], gasPrice: BURNER_GAS_PRICE, gas: BURNER_GAS_LIMIT });
      const started = await publicClient.waitForTransactionReceipt({ hash: startHash });
      if (started.status !== "success") throw new Error("Start failed, open the table and press Start");
      setDone(5);
      router.push(`/t/${id}`);
    } catch (e) {
      setError((e as Error).message.slice(0, 160));
    }
  }

  return (
    <div className="kc-app">
      <main className="kc-table grid place-items-center">
        <div className="kc-rays" />
        <div className="kc-grain" />
        <div className="kc-box relative z-10 col-[1/-1] row-[1/-1] mx-4 grid gap-4 place-self-center text-left">
          <h2 className="text-center">New table on Sepolia</h2>
          <p className="text-center">You play with a key that lives only in this tab. We send it a little test ETH, so you do not need a wallet.</p>
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
            {STEPS.map((step, i) => (
              <li key={step} className={cn("flex items-center gap-2", i > done + 1 && "opacity-50")}>
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
          <button type="button" className="kc-btn justify-self-center" onClick={go} disabled={running}>
            {error ? "Try again" : "Create table"}
          </button>
        </div>
      </main>
    </div>
  );
}
