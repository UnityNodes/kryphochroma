import { BookOpen, Play } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
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
      <header className="sticky top-0 z-20 border-b border-cream/10 bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 font-display text-2xl text-sun">
            Kryphochroma
            <span className="flex items-center gap-1 rounded-full border border-cream/20 px-2 py-0.5 font-sans text-xs text-muted">
              <BookOpen className="size-3.5" aria-hidden />
              Docs
            </span>
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/secret" className="hidden rounded-full px-3 py-1.5 text-cream/80 hover:text-cream sm:inline">
              How it stays secret
            </Link>
            <Link href="/new" className="kc-chip kc-chip-on">
              <Play aria-hidden />
              Play
            </Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1280px] gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12 lg:px-8 lg:py-14">
        <Sidebar groups={GROUPS} />
        {children}
      </div>
    </div>
  );
}
