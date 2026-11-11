import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DOCS, docBySlug } from "@/guide/content";
import { readDeployment } from "@/guide/deployment";

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { readonly params: Promise<{ slug: string }> }): Promise<Metadata> {
  const doc = docBySlug((await params).slug);
  return doc ? { title: `${doc.title} · Kryphochroma docs`, description: doc.summary } : {};
}

export default async function DocPage({ params }: { readonly params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = docBySlug(slug);
  if (!doc) notFound();
  const index = DOCS.indexOf(doc);
  const prev = DOCS[index - 1];
  const next = DOCS[index + 1];
  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_200px]">
      <article className="min-w-0 max-w-3xl">
        <p className="text-xs font-semibold tracking-[.12em] text-muted uppercase">{doc.group}</p>
        <h1 className="mt-2 font-display text-5xl leading-none text-cream">{doc.title}</h1>
        <p className="mt-4 text-lg text-muted">{doc.summary}</p>
        <div className="mt-10">{doc.body(readDeployment())}</div>
        <nav className="mt-16 grid gap-3 border-t border-cream/10 pt-6 sm:grid-cols-2" aria-label="Pages">
          {prev ? (
            <Link href={`/docs/${prev.slug}`} className="group rounded-2xl border border-cream/15 p-4 hover:border-sun/60">
              <span className="flex items-center gap-1 text-xs text-muted">
                <ArrowLeft className="size-3.5" aria-hidden />
                Previous
              </span>
              <b className="text-cream group-hover:text-sun">{prev.title}</b>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/docs/${next.slug}`} className="group rounded-2xl border border-cream/15 p-4 text-right hover:border-sun/60">
              <span className="flex items-center justify-end gap-1 text-xs text-muted">
                Next
                <ArrowRight className="size-3.5" aria-hidden />
              </span>
              <b className="text-cream group-hover:text-sun">{next.title}</b>
            </Link>
          )}
        </nav>
      </article>
      <aside className="sticky top-24 hidden h-fit xl:block" aria-label="On this page">
        <p className="text-xs font-semibold tracking-[.12em] text-muted uppercase">On this page</p>
        <ul className="mt-3 grid gap-2 border-l border-cream/10 pl-3 text-sm">
          {doc.headings.map((h) => (
            <li key={h.id}>
              <a href={`#${h.id}`} className="text-cream/70 hover:text-sun">
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
