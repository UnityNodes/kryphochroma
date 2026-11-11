import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { tableIdFromCode } from "@/lib/invite";
import { ClientChainTable } from "../../t/[id]/ClientChainTable";

export async function generateMetadata({ params }: { readonly params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const title = `Join table ${code}`;
  const description = `You are invited to a Kryphochroma table. Sit down as a guest, no wallet needed: a card game where every hand stays encrypted with Zama FHE on Sepolia.`;
  return {
    title,
    description,
    openGraph: { title: `${title} on Kryphochroma`, description, images: [{ url: "/og.png", width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: `${title} on Kryphochroma`, description, images: ["/og.png"] },
  };
}

export default async function InvitePage({ params }: { readonly params: Promise<{ code: string }> }) {
  const { code } = await params;
  const id = tableIdFromCode(code);
  if (id === null) notFound();
  return <ClientChainTable id={id.toString()} />;
}
