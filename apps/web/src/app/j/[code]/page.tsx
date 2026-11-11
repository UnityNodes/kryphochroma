import { notFound } from "next/navigation";
import { tableIdFromCode } from "@/lib/invite";
import { ClientChainTable } from "../../t/[id]/ClientChainTable";

export default async function InvitePage({ params }: { readonly params: Promise<{ code: string }> }) {
  const { code } = await params;
  const id = tableIdFromCode(code);
  if (id === null) notFound();
  return <ClientChainTable id={id.toString()} />;
}
