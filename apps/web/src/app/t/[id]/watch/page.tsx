import { notFound } from "next/navigation";
import { ClientChainTable } from "../ClientChainTable";

export default async function WatchPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9]{1,12}$/.test(id)) notFound();
  return <ClientChainTable id={id} watch />;
}
