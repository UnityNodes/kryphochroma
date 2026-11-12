import type { Metadata } from "next";
import { SiteHeader } from "@/components/site/SiteHeader";
import { DOCS } from "@/guide/content";
import { type NavGroup, Sidebar } from "@/guide/Sidebar";

export const metadata: Metadata = {
  title: "Docs · Kryphochroma",
  description: "Rules, mechanics, privacy model, architecture and contracts of Kryphochroma, an FHE card game on Zama FHEVM.",
};

const GROUPS: readonly NavGroup[] = [...new Set(DOCS.map((d) => d.group))].map((group) => ({
  group,
  pages: DOCS.filter((d) => d.group === group).map((d) => ({ slug: d.slug, title: d.title })),
}));

export default function DocsLayout({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg text-cream">
      <SiteHeader section="Docs" wide />
      <div className="mx-auto grid max-w-[1280px] gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12 lg:px-8 lg:py-14">
        <Sidebar groups={GROUPS} />
        {children}
      </div>
    </div>
  );
}
