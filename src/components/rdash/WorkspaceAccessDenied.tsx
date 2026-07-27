"use client";

import Link from "next/link";
import { LockKeyhole } from "lucide-react";

export function WorkspaceAccessDenied({
  moduleLabel,
  permissionModule,
}: {
  moduleLabel: string;
  permissionModule: string;
}) {
  return (
    <section className="mx-auto flex min-h-[55vh] w-full max-w-2xl items-center justify-center p-4" aria-labelledby="workspace-access-denied-title">
      <div className="w-full rounded-2xl border border-border bg-card p-7 text-center shadow-card">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <LockKeyhole className="h-6 w-6" aria-hidden />
        </div>
        <h1 id="workspace-access-denied-title" className="mt-4 text-xl font-bold">Access denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your role does not have permission to view {moduleLabel}.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Required workspace permission: <span className="font-mono">{permissionModule}</span>
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/workspace" replace className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">
            Go to Workdesk
          </Link>
          <button type="button" onClick={() => window.history.back()} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold transition-colors hover:bg-accent">
            Go back
          </button>
        </div>
        <p className="mt-5 text-xs text-muted-foreground">Contact the workspace owner when access is required for your role.</p>
      </div>
    </section>
  );
}
