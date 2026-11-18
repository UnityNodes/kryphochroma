import { House, Play } from "lucide-react";
import Link from "next/link";
import { PageShell } from "@/components/site/PageShell";

export default function NotFound() {
  return (
    <PageShell>
      <div className="grid flex-1 place-items-center px-4 py-14">
        <div className="kc-box grid gap-4">
          <h1 className="font-display text-4xl leading-none text-brass">No such table</h1>
          <p>This link points nowhere. Table invites look like /j/teal-otter; check the spelling or open a new table.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/new" className="kc-btn kc-btn-brass">
              <Play aria-hidden />
              Play
            </Link>
            <Link href="/" className="kc-btn">
              <House aria-hidden />
              Home
            </Link>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
