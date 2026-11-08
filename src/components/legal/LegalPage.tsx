import Link from "next/link";
import type { ReactNode } from "react";

export function LegalPage({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <Link href="/" className="flex items-center gap-3" aria-label="Urban Castle home">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-sm font-black text-white">UC</span>
            <span className="font-bold">Urban Castle</span>
          </Link>
          <Link href="/signin" className="text-sm font-semibold text-blue-700 hover:underline">Open workspace</Link>
        </header>

        <article className="py-10">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-blue-700">Effective 8 November 2026</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-5 text-lg leading-8 text-slate-600">{summary}</p>
          <div className="mt-10 space-y-9 text-[15px] leading-7 text-slate-700 [&_a]:font-semibold [&_a]:text-blue-700 [&_a]:underline [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-tight [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-3 [&_ul]:mt-3">
            {children}
          </div>
        </article>

        <footer className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-200 pt-6 text-sm text-slate-500">
          <Link href="/">Home</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/tos">Terms</Link>
          <a href="mailto:akarshsingh4@gmail.com">Contact</a>
        </footer>
      </div>
    </main>
  );
}
