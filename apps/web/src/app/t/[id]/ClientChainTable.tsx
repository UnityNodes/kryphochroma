"use client";

import dynamic from "next/dynamic";

const ChainTable = dynamic(() => import("@/components/chain/ChainTable").then((m) => m.ChainTable), {
  ssr: false,
  loading: () => <div className="kc-app" aria-busy="true" />,
});

export function ClientChainTable({ id, watch }: { readonly id: string; readonly watch?: boolean }) {
  return <ChainTable id={id} watch={watch} />;
}
