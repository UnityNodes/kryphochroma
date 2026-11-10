"use client";

import dynamic from "next/dynamic";

const NewTable = dynamic(() => import("@/components/chain/NewTable").then((m) => m.NewTable), {
  ssr: false,
  loading: () => <div className="kc-app" aria-busy="true" />,
});

export function ClientNewTable() {
  return <NewTable />;
}
