"use client";

import { kryphoTableAbi } from "@kryphochroma/abi";
import { useState } from "react";
import { toast } from "sonner";
import { createPublicClient, createWalletClient, http } from "viem";
import { sepolia } from "viem/chains";
import { loadBurner } from "@/chain/burner";
import { confirm } from "@/chain/confirm";
import { BURNER_GAS_LIMIT, BURNER_GAS_PRICE, SEPOLIA_RPC_URL, TABLE_ADDRESS } from "@/chain/config";
import { useChainGame } from "@/chain/useChainGame";
import { TableView, useColorBlind } from "@/components/table/Table";
import { PreGame } from "./PreGame";

export function ChainTable({ id }: { readonly id: string }) {
  const [colorBlind, setColorBlind] = useColorBlind();
  const game = useChainGame(BigInt(id), colorBlind);
  const [working, setWorking] = useState(false);

  const fill = async () => {
    setWorking(true);
    const res = await fetch("/api/fill", { method: "POST", body: JSON.stringify({ id }) });
    if (!res.ok) toast.error("Could not seat the bots");
    setWorking(false);
  };

  const start = async () => {
    setWorking(true);
    try {
      const account = loadBurner(window.sessionStorage);
      const transport = http(SEPOLIA_RPC_URL);
      const wallet = createWalletClient({ account, chain: sepolia, transport });
      const hash = await wallet.writeContract({ address: TABLE_ADDRESS, abi: kryphoTableAbi, functionName: "start", args: [BigInt(id)], gasPrice: BURNER_GAS_PRICE, gas: BURNER_GAS_LIMIT });
      await confirm(createPublicClient({ chain: sepolia, transport }), hash, "Start");
    } catch (e) {
      toast.error((e as Error).message.slice(0, 120));
    }
    setWorking(false);
  };

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
    return <PreGame snapshot={game.snapshot} address={game.address} onFill={fill} onStart={start} working={working} />;
  }
  return <TableView controller={game} colorBlind={colorBlind} onToggleShapes={() => setColorBlind((v) => !v)} />;
}
