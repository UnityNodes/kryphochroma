"use client";

import dynamic from "next/dynamic";
import type { TableProps } from "./Table";

const Table = dynamic(() => import("./Table").then((m) => m.Table), {
  ssr: false,
  loading: () => <div className="kc-app" aria-busy="true" />,
});

export function ClientTable(props: TableProps) {
  return <Table {...props} />;
}
