"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createPublicClient } from "viem";
import { sepolia } from "viem/chains";
import { loadBurner } from "@/chain/burner";
import { friendlyError } from "@/chain/errors";
import { trackSeat, useSeatInFlight } from "@/chain/inflight";
import { RECEIPT_POLL_MS, sepoliaTransport } from "@/chain/rpc";
import { type Funder, type SeatDeps, fundBurner, requestBots, seatWithRetry, serviceDrip as drip, leaveTable, startTable } from "@/chain/seat";
import { useChainGame } from "@/chain/useChainGame";
import { useFunder } from "@/components/wallet/useFunder";
import { TableView, useColorBlind } from "@/components/table/Table";
import { PageShell } from "@/components/site/PageShell";
import { WaitHint } from "@/components/table/ChainProgress";
import { PreGame } from "./PreGame";

function seatDeps(funder: Funder): SeatDeps {
  return { publicClient: createPublicClient({ chain: sepolia, transport: sepoliaTransport(), pollingInterval: RECEIPT_POLL_MS }), burner: loadBurner(window.sessionStorage), funder, drip };
}

const CHAIN_ERROR_TOAST = "chain-error";

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

  const playing = Number(game.snapshot?.table.stage ?? 0) >= 3;
  useEffect(() => {
    if (playing && game.error) toast.error(game.error, { id: CHAIN_ERROR_TOAST, duration: Number.POSITIVE_INFINITY });
    else toast.dismiss(CHAIN_ERROR_TOAST);
  }, [playing, game.error]);

  const joining = useSeatInFlight(id);
  const join = () => {
    if (!funderState.ready) {
      toast.error(funderState.reason === "wrong-chain" ? "Switch your wallet to Sepolia first" : "Wallet is still connecting");
      return;
    }
    trackSeat(id, seatWithRetry(seatDeps(funderState.funder), BigInt(id))).catch((e: unknown) => toast.error(`Could not join: ${friendlyError(e)}`));
  };

  const fill = async () => {
    setWorking(true);
    await requestBots(loadBurner(window.sessionStorage), BigInt(id)).catch((e: unknown) => toast.error(friendlyError(e)));
    setWorking(false);
  };

  const leave = () =>
    withFunder("Could not leave", async (deps) => {
      await fundBurner(deps);
      const { settled } = await leaveTable(deps, BigInt(id));
      router.push("/new");
      settled.then(
        () => toast.success("You left the table"),
        (e: unknown) => toast.error(`Could not leave: ${friendlyError(e)}`),
      );
    });

  const start = () =>
    withFunder("Could not start", async (deps) => {
      await fundBurner(deps);
      await startTable(deps, BigInt(id));
    });

  const dealt = Number(game.snapshot?.table.stage ?? 0) >= 3;
  if (!game.snapshot || (dealt && !game.ready)) {
    return (
      <PageShell>
        <div className="grid flex-1 place-items-center px-4 py-14" aria-busy="true">
          {game.error ? (
            <p className="kc-status" role="status">{`Reconnecting to Sepolia. ${game.error}`}</p>
          ) : (
            <WaitHint
              note={
                dealt
                  ? { title: "Reading the dealt cards", why: "Your cards are ciphertexts stored in the contract. The browser reads them from Sepolia, then Zama KMS opens them for your key only." }
                  : { title: "Reading the table from Sepolia", why: "Everything about this table lives in the contract, so the page loads it straight from the chain." }
              }
            />
          )}
        </div>
      </PageShell>
    );
  }
  if (/^0x0+$/.test(game.snapshot.table.creator)) {
    return (
      <PageShell>
        <div className="grid flex-1 place-items-center px-4 py-14">
          <div className="kc-panel grid max-w-md gap-4 p-6 text-center sm:p-8">
            <h1 className="font-display text-4xl leading-none text-sun">No such table</h1>
            <p className="text-cream/75">This table does not exist on the current contract. It may belong to an earlier deployment of the game.</p>
            <Link href="/new" className="kc-btn justify-self-center">
              Open a new table
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }
  if (!dealt) {
    return <PreGame id={id} snapshot={game.snapshot} address={game.address} watching={Boolean(watch)} onFill={fill} onStart={start} onJoin={join} onLeave={leave} working={working} joining={joining} />;
  }
  return <TableView controller={game} colorBlind={colorBlind} onToggleShapes={() => setColorBlind((v) => !v)} />;
}
