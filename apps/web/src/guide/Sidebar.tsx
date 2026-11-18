"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface NavGroup {
  readonly group: string;
  readonly pages: readonly { readonly slug: string; readonly title: string }[];
}

function Links({ groups }: { readonly groups: readonly NavGroup[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Docs" className="grid gap-6">
      {groups.map((g) => (
        <div key={g.group} className="grid gap-1">
          <p className="px-3 text-xs font-semibold tracking-[.12em] text-muted uppercase">{g.group}</p>
          {g.pages.map((p) => {
            const active = path === `/docs/${p.slug}`;
            return (
              <Link key={p.slug} href={`/docs/${p.slug}`} aria-current={active ? "page" : undefined} className={cn("flex min-h-11 items-center rounded-[4px] px-3 text-sm transition-colors", active ? "bg-brass/15 font-semibold text-brass" : "text-cream/80 hover:bg-cream/5 hover:text-cream")}>
                {p.title}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ groups }: { readonly groups: readonly NavGroup[] }) {
  return (
    <>
      <details className="rounded-md border border-cream/15 bg-black/30 p-3 lg:hidden">
        <summary className="cursor-pointer text-sm font-semibold text-cream">Menu</summary>
        <div className="mt-4">
          <Links groups={groups} />
        </div>
      </details>
      <aside className="sticky top-24 hidden max-h-[calc(100dvh-7rem)] overflow-y-auto lg:block">
        <Links groups={groups} />
      </aside>
    </>
  );
}
