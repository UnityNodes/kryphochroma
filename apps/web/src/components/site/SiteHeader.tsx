"use client";

import { BookOpen, Play } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/secret", label: "How it stays secret", match: (p: string) => p.startsWith("/secret"), wide: true },
  { href: "/docs", label: "Docs", match: (p: string) => p.startsWith("/docs"), wide: false },
] as const;

export function SiteHeader({ section, wide = false }: { readonly section?: string; readonly wide?: boolean }) {
  const path = usePathname() ?? "/";
  const playing = path.startsWith("/new") || path.startsWith("/j/") || path.startsWith("/t/");
  return (
    <header className="sticky top-0 z-30 border-b border-cream/10 bg-bg/85 backdrop-blur-md">
      <div className={cn("mx-auto flex h-16 items-center justify-between gap-3 px-4 sm:px-6", wide ? "max-w-[1280px] lg:px-8" : "max-w-[1200px]")}>
        <Link href="/" className="flex min-h-11 items-center gap-2 font-display text-2xl text-sun" aria-label="Kryphochroma home">
          Kryphochroma
          {section && (
            <span className="hidden items-center gap-1 rounded-full border border-cream/20 px-2 py-0.5 font-sans text-xs text-muted sm:flex">
              <BookOpen className="size-3.5" aria-hidden />
              {section}
            </span>
          )}
        </Link>
        <nav className="flex items-center gap-1 text-sm" aria-label="Main">
          {LINKS.map(({ href, label, match, wide }) => (
            <Link
              key={href}
              href={href}
              aria-current={match(path) ? "page" : undefined}
              className={cn("min-h-11 items-center rounded-full px-3 text-cream/75 transition-colors hover:text-cream aria-[current=page]:text-sun", wide ? "hidden sm:flex" : "flex")}
            >
              {label}
            </Link>
          ))}
          <Link href="/new" aria-current={playing ? "page" : undefined} className="kc-chip kc-chip-on ml-1 min-h-11">
            <Play aria-hidden />
            Play
          </Link>
        </nav>
      </div>
    </header>
  );
}
