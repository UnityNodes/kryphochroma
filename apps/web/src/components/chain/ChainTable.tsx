"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createPublicClient } from "viem";
import { sepolia } from "viem/chains";
import { loadBurner } from "@/chain/burner";
import { friendlyError } from "@/chain/errors";
import { RECEIPT_POLL_MS, sepoliaTransport } from "@/chain/rpc";
import { type Funder, type SeatDeps, fundBurner, requestBots, serviceDrip as drip, leaveTable, startTable, takeSeat } from "@/chain/seat";
import { useChainGame } from "@/chain/useChainGame";
import { useFunder } from "@/components/wallet/useFunder";
import { TableView, useColorBlind } from "@/components/table/Table";
import { PreGame } from "./PreGame";

function seatDeps(funder: Funder): SeatDeps {
  return { publicClient: createPublicClient({ chain: sepolia, transport: sepoliaTransport(), pollingInterval: RECEIPT_POLL_MS }), burner: loadBurner(window.sessionStorage), funder, drip };
}

export function ChainTable({ id, watch }: { readonly id: string; readonly watch?: boolean }) {
  const [colorBlind, setColorBlind] = useColorBlind();
  const game = useChainGame(BigInt(id), colorBlind, watch);
  const funderState = useFunder();
  const [working, setWorking] = useState(false);
  const router = useRouter();

  const withFunder = async (label: string, task: (deps: SeatDeps) => Promise<void>) => {
    if (!funderState.ready) {
      toast.error(funderState.reason === "wrong-chain" ? "Switch your wallet to Sepolia first" : "Wallet is still connecting");
      return;
    }
    setWorking(true);
    try {
      await task(seatDeps(funderState.funder));
    } catch (e) {
      toast.error(`${label}: ${friendlyError(e)}`);
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
    await requestBots(loadBurner(window.sessionStorage), BigInt(id)).catch((e: unknown) => toast.error(friendlyError(e)));
    setWorking(false);
  };

  const leave = () =>
    withFunder("Could not leave", async (deps) => {
      await fundBurner(deps);
      await leaveTable(deps, BigInt(id));
      toast.success("You left the table");
      router.push("/new");
    });

  const start = () =>
    withFunder("Could not start", async (deps) => {
      await fundBurner(deps);
      await startTable(deps, BigInt(id));
    });

  if (!game.snapshot) {
    return (
      <div className="kc-app grid place-items-center" aria-busy="true">
        <p className="kc-status" role="status">
          {game.error ? `Reconnecting to Sepolia. ${game.error}` : "Reading the table from Sepolia…"}
        </p>
      </div>
    );
  }
  if (Number(game.snapshot.table.stage) < 3) {
    return <PreGame id={id} snapshot={game.snapshot} address={game.address} watching={Boolean(watch)} onFill={fill} onStart={start} onJoin={join} onLeave={leave} working={working} />;
  }
  return <TableView controller={game} colorBlind={colorBlind} onToggleShapes={() => setColorBlind((v) => !v)} />;
}
