import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Urban Castle | Business Workspace",
  description:
    "Urban Castle is a business workspace for customer management, quotations, site execution, procurement, finance, and project files.",
};

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-5 py-8 sm:px-8 sm:py-12">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3" aria-label="Urban Castle home">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-sm font-black text-white">
              UC
            </span>
            <span>
              <span className="block font-bold">Urban Castle</span>
              <span className="block text-xs text-slate-500">Business Workspace</span>
            </span>
          </Link>
          <Link
            href="/signin"
            className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Open workspace
          </Link>
        </header>

        <section className="flex flex-1 items-center py-16 sm:py-24">
          <div className="max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-700">
              Interior projects, one operating workspace
            </p>
            <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">
              Run customer work from first enquiry to final delivery.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              Urban Castle helps authorized team members manage customers, quotations, site execution,
              procurement, finance, field activity, and project documents. Its Google Drive connection
              lets a workspace owner store and manage selected project files in a Drive account they control.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signin" className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800">
                Sign in
              </Link>
              <Link href="/privacy" className="rounded-lg border border-slate-300 bg-white px-5 py-3 font-semibold hover:bg-slate-100">
                Privacy policy
              </Link>
              <Link href="/tos" className="rounded-lg border border-slate-300 bg-white px-5 py-3 font-semibold hover:bg-slate-100">
                Terms of service
              </Link>
            </div>
          </div>
        </section>

        <footer className="flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-5 text-sm text-slate-500">
          <span>© 2026 Urban Castle</span>
          <span>Interior design · execution · project delivery</span>
        </footer>
      </div>
    </main>
  );
}
