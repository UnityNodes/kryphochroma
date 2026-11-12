"use client";

import { Check, Copy } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

export function Code({ children, title }: { readonly children: string; readonly title?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <figure className="my-5 overflow-hidden rounded-2xl border border-cream/15 bg-black/40">
      <figcaption className="flex items-center justify-between border-b border-cream/10 px-4 py-2 text-xs text-muted">
        <span className="font-mono">{title ?? "code"}</span>
        <button type="button" onClick={() => void copy()} className="flex items-center gap-1 rounded-md px-2 py-1 hover:bg-cream/10 hover:text-cream" aria-label="Copy code">
          {copied ? <Check className="size-3.5 text-teal" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
      </figcaption>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed text-cream" tabIndex={0} aria-label={title ?? "code"}>
        <code>{children}</code>
      </pre>
    </figure>
  );
}

export function Callout({ tone = "info", title, children }: { readonly tone?: "info" | "warn" | "ok"; readonly title: string; readonly children: ReactNode }) {
  const border = tone === "warn" ? "border-red/40 bg-red/10" : tone === "ok" ? "border-teal/40 bg-teal/10" : "border-sun/35 bg-sun/10";
  return (
    <aside className={cn("my-5 rounded-2xl border px-4 py-3 text-sm", border)}>
      <b className="block text-cream">{title}</b>
      <div className="mt-1 text-muted">{children}</div>
    </aside>
  );
}
