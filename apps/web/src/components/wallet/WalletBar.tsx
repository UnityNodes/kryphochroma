"use client";

import { LogOut, Wallet } from "lucide-react";
import { sepolia } from "viem/chains";
import { useAccount, useConnect, useConnectors, useDisconnect, useSwitchChain } from "wagmi";

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

export function WalletBar({ disabled }: { readonly disabled?: boolean }) {
  const { address, chainId, isConnected } = useAccount();
  const connectors = useConnectors();
  const { connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const injected = connectors[0];
  const available = typeof window !== "undefined" && "ethereum" in window;

  if (!isConnected || !address) {
    if (!available) return <p className="text-center text-sm text-muted">No browser wallet found. Guest mode needs none.</p>;
    return (
      <div className="grid justify-items-center gap-1 text-sm">
        <button type="button" className="kc-chip" onClick={() => injected && connect({ connector: injected, chainId: sepolia.id })} disabled={disabled || isPending || !injected}>
          <Wallet className="mr-1 inline size-4" aria-hidden />
          {isPending ? "Waiting for the wallet…" : "Connect wallet (optional)"}
        </button>
        {error && <span className="text-red">{error.message.split("\n")[0]?.slice(0, 120)}</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
      <span className="kc-chip kc-chip-on">
        <Wallet className="mr-1 inline size-4" aria-hidden />
        {short(address)}
      </span>
      {chainId !== sepolia.id && (
        <button type="button" className="kc-chip" onClick={() => switchChain({ chainId: sepolia.id })} disabled={disabled || switching}>
          {switching ? "Switching…" : "Switch to Sepolia"}
        </button>
      )}
      <button type="button" className="kc-chip" onClick={() => disconnect()} disabled={disabled} aria-label="Disconnect wallet">
        <LogOut className="size-4" aria-hidden />
      </button>
    </div>
  );
}
