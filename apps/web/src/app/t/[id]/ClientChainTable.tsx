"use client";

import dynamic from "next/dynamic";

const ChainTable = dynamic(() => import("@/components/chain/ChainTable").then((m) => m.ChainTable), {
  ssr: false,
  loading: () => <div className="kc-app" aria-busy="true" />,
});

export function ClientChainTable({ id }: { readonly id: string }) {
  return <ChainTable id={id} />;
}
