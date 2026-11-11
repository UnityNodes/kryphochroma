"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { loadBurner } from "@/chain/burner";
import { SEPOLIA_RPC_URL } from "@/chain/config";
import { type Funder, type SeatDeps, fundBurner, serviceDrip as drip, startTable, takeSeat } from "@/chain/seat";
import { useChainGame } from "@/chain/useChainGame";
import { useFunder } from "@/components/wallet/useFunder";
import { TableView, useColorBlind } from "@/components/table/Table";
import { PreGame } from "./PreGame";

function seatDeps(funder: Funder): SeatDeps {
  return { publicClient: createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC_URL) }), burner: loadBurner(window.sessionStorage), funder, drip };
}

export function ChainTable({ id, watch }: { readonly id: string; readonly watch?: boolean }) {
  const [colorBlind, setColorBlind] = useColorBlind();
  const game = useChainGame(BigInt(id), colorBlind, watch);
  const funderState = useFunder();
  const [working, setWorking] = useState(false);

  const withFunder = async (label: string, task: (deps: SeatDeps) => Promise<void>) => {
    if (!funderState.ready) {
      toast.error(funderState.reason === "wrong-chain" ? "Switch your wallet to Sepolia first" : "Wallet is still connecting");
      return;
    }
    setWorking(true);
    try {
      await task(seatDeps(funderState.funder));
    } catch (e) {
      toast.error(`${label}: ${(e as Error).message.split("\n")[0]?.slice(0, 120)}`);
    }
    setWorking(false);
  };

  const join = () =>
    withFunder("Could not join", async (deps) => {
      if (deps.funder.kind === "guest") await fundBurner(deps);
      await takeSeat(deps, BigInt(id));
    });

  const fill = async () => {
    setWorking(true);
    const res = await fetch("/api/fill", { method: "POST", body: JSON.stringify({ id }) });
    if (!res.ok) toast.error("Could not seat the bots");
    setWorking(false);
  };

  const start = () =>
    withFunder("Could not start", async (deps) => {
      await fundBurner(deps);
      await startTable(deps, BigInt(id));
    });

  if (!game.snapshot) {
    return (
      <div className="kc-app grid place-items-center" aria-busy="true">
        <p className="kc-status" role="status">
          {game.error ? `Reconnecting to Sepolia: ${game.error}` : "Reading the table from Sepolia…"}
        </p>
      </div>
    );
  }
  if (Number(game.snapshot.table.stage) < 3) {
    return <PreGame id={id} snapshot={game.snapshot} address={game.address} watching={Boolean(watch)} onFill={fill} onStart={start} onJoin={join} working={working} />;
  }
  return <TableView controller={game} colorBlind={colorBlind} onToggleShapes={() => setColorBlind((v) => !v)} />;
}
