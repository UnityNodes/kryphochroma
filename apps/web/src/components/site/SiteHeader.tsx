"use client";

import { ArrowLeft, BookOpen, House, Menu, Play, ShieldCheck, Swords, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { backTarget } from "@/lib/backTarget";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/play", label: "Practice", icon: Swords, match: (p: string) => p.startsWith("/play") },
  { href: "/secret", label: "How it stays secret", icon: ShieldCheck, match: (p: string) => p.startsWith("/secret") },
  { href: "/docs", label: "Docs", icon: BookOpen, match: (p: string) => p.startsWith("/docs") },
] as const;

const isPlaying = (p: string) => p.startsWith("/new") || p.startsWith("/j/") || p.startsWith("/t/");

export function SiteHeader({ section, wide = false }: { readonly section?: string; readonly wide?: boolean }) {
  const path = usePathname() ?? "/";
  const back = backTarget(path);
  const playing = isPlaying(path);
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [path]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-30 border-b border-cream/10 bg-bg/90 backdrop-blur-md">
      <div className={cn("mx-auto flex h-16 items-center gap-2 px-3 sm:gap-3 sm:px-6", wide ? "max-w-[1280px] lg:px-8" : "max-w-[1200px]")}>
        {back && (
          <Link
            href={back.href}
            aria-label={`Back to ${back.label}`}
            className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-cream/80 text-cream transition-[transform,background-color] hover:bg-cream/10 active:scale-90 sm:flex sm:w-auto sm:gap-1.5 sm:pr-4 sm:pl-3 sm:text-sm sm:font-semibold"
          >
            <ArrowLeft className="size-[18px]" aria-hidden />
            <span className="hidden sm:inline">{back.label}</span>
          </Link>
        )}
        <Link href="/" className="flex min-h-11 min-w-0 items-center gap-2 font-display text-[22px] leading-none text-sun [text-shadow:2px_2px_0_var(--color-red)] sm:text-2xl" aria-label="Kryphochroma home">
          <span className="truncate">Kryphochroma</span>
          {section && (
            <span className="hidden items-center gap-1 rounded-full border border-cream/20 px-2 py-0.5 font-sans text-xs text-muted [text-shadow:none] sm:flex">
              <BookOpen className="size-3.5" aria-hidden />
              {section}
            </span>
          )}
        </Link>
        <nav className="ml-auto hidden items-center gap-1 text-sm md:flex" aria-label="Main">
          {LINKS.map(({ href, label, match }) => (
            <Link key={href} href={href} aria-current={match(path) ? "page" : undefined} className="flex min-h-11 items-center rounded-full px-3 text-cream/75 transition-colors hover:text-cream aria-[current=page]:text-sun">
              {label}
            </Link>
          ))}
          <Link href="/new" aria-current={playing ? "page" : undefined} className="kc-chip kc-chip-on ml-1 min-h-11 px-4">
            <Play aria-hidden />
            Play
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2 md:hidden">
          {!playing && (
            <Link href="/new" className="kc-chip kc-chip-on min-h-11 px-4">
              <Play aria-hidden />
              Play
            </Link>
          )}
          <button
            type="button"
            className="grid size-11 place-items-center rounded-full border-2 border-cream/80 transition-transform active:scale-90"
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>
      </div>
      <nav
        id="site-menu"
        aria-label="Menu"
        hidden={!open}
        className="kc-menu absolute inset-x-0 top-full border-b-2 border-cream/15 bg-bg/97 px-3 pt-2 pb-5 shadow-[0_24px_40px_-12px_rgba(0,0,0,.7)] backdrop-blur-md md:hidden"
      >
        <ul className="grid gap-1">
          {[{ href: "/", label: "Home", icon: House, match: (p: string) => p === "/" }, { href: "/new", label: "Play on Sepolia", icon: Play, match: isPlaying }, ...LINKS].map(({ href, label, icon: Icon, match }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={match(path) ? "page" : undefined}
                className="flex min-h-13 items-center gap-3 rounded-2xl px-3 text-lg font-semibold text-cream transition-colors hover:bg-cream/5 aria-[current=page]:bg-sun aria-[current=page]:text-ink"
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
