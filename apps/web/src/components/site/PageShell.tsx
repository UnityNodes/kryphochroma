import type { ReactNode } from "react";
import { SiteHeader } from "./SiteHeader";

export function PageShell({ children, section }: { readonly children: ReactNode; readonly section?: string }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col bg-bg text-cream">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="kc-rays" />
        <div className="kc-grain" />
      </div>
      <SiteHeader section={section} />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
