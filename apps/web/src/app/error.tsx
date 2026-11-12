"use client";

import { House, RotateCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { isStaleBuildError, shouldAutoReload } from "@/lib/staleBuild";

export default function ErrorPage({ error, reset }: { readonly error: Error & { digest?: string }; readonly reset: () => void }) {
  const stale = isStaleBuildError(error);

  useEffect(() => {
    if (stale && shouldAutoReload(window.sessionStorage, Date.now())) window.location.reload();
  }, [stale]);

  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4 text-cream">
      <div className="kc-box grid gap-4">
        <h1 className="font-display text-3xl text-sun">{stale ? "A new version is out" : "Something broke"}</h1>
        <p className="text-sm text-cream/80">
          {stale ? "The site was updated while this tab was open. Reload to get the new version, your seat stays on chain." : "This screen hit an error. Your seat and cards stay on chain, reloading picks the table up again."}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" className="kc-btn kc-mono" onClick={() => (stale ? window.location.reload() : reset())}>
            <RotateCw aria-hidden />
            Reload
          </button>
          <Link href="/new" className="kc-btn">
            <House aria-hidden />
            Menu
          </Link>
        </div>
      </div>
    </div>
  );
}
